#!/usr/bin/env node
// build-validation-check: Build must never report malformed FeatureScript as a
// success.
//
// Permanent harness (qa:build-validation). It reproduces the verified defect on
// the REAL dev build: the default graph (devEditor.ts) is four unconnected
// nodes -- two Chamfers, one Define Feature, one End Feature -- so the node
// processor prunes everything except the End Feature and the generator used to
// return a header plus one orphan `});` (181 bytes). Build logged
// "Built FeatureScript (181 bytes)" for it.
//
// This check boots the app on port 5221 (or uses QA_URL), clicks Build on that
// unwired graph, and fails unless:
//   1. the Build log entry is an ERROR (never "Built FeatureScript"),
//   2. the error text names the missing Define Feature / End Feature chain,
//   3. no malformed source (header + orphan `});`) is attached to the log,
//   4. `studioEvents.build()` itself refuses with that actionable message
//      rather than resolving to a source string.
//
// Usage:
//   pnpm run qa:build-validation                     (boots vite on 5221)
//   QA_URL=http://127.0.0.1:5221/onshape-node-editor/ node qa/harness/build-validation-check.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 5221;
const DEFAULT_URL = `http://127.0.0.1:${PORT}/onshape-node-editor/`;
const URL = process.env.QA_URL ?? DEFAULT_URL;
const OUT = 'tmp/qa-runs/build-validation/';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${String(detail).slice(0, 500)}` : ''}`);
  if (!ok) failures.push(name);
};

// --- Dev server -----------------------------------------------------------
// Only started when QA_URL is not supplied. `detached` puts vite in its own
// process group so the whole tree dies with one signal; the harness must never
// leave a server behind.
let server = null;
let serverLog = '';

function stopServer() {
  if (server == null) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    try { server.kill('SIGTERM'); } catch { /* already gone */ }
  }
  server = null;
}

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not listening yet */ }
    await sleep(250);
  }
  throw new Error(`dev server did not answer at ${url}\n${serverLog.slice(-1000)}`);
}

async function startServer() {
  server = spawn(process.execPath, [
    'node_modules/vite/bin/vite.js',
    '--port', String(PORT),
    '--host', '127.0.0.1',
    '--strictPort',
  ], { cwd: REPO_ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (chunk) => { serverLog += chunk; });
  server.stderr.on('data', (chunk) => { serverLog += chunk; });
  await waitForServer(URL);
}

async function main() {
  if (process.env.QA_URL == null) {
    console.log(`build-validation-check: booting vite on ${PORT} ...`);
    await startServer();
  } else {
    await waitForServer(URL);
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.controls != null && typeof window.controls.studioEvents?.build === 'function',
      null,
      { timeout: 30000 },
    );
    await page.waitForFunction(() => document.querySelectorAll('.node').length >= 4, null, { timeout: 30000 });
    await sleep(600);

    // The defect is specifically the unwired default graph: confirm the state
    // the check is about rather than trusting the fixture.
    const graph = await page.evaluate(() => ({
      nodes: window.editor.getNodes().length,
      connections: window.editor.getConnections().length,
      defineFeatures: window.editor.getNodes().filter((node) => node.type === 'define-feature').length,
      endFeatures: window.editor.getNodes().filter((node) => node.type === 'output-feature').length,
    }));
    check('default graph has 4 nodes and no connections', graph.nodes >= 4 && graph.connections === 0, JSON.stringify(graph));
    check('default graph has an unconnected Define Feature and End Feature',
      graph.defineFeatures >= 1 && graph.endFeatures >= 1, JSON.stringify(graph));

    // 1/2: real click on Build, then read the rendered log.
    await page.getByRole('button', { name: 'Build', exact: true }).click();
    await page.waitForFunction(
      () => [...document.querySelectorAll('.log-panel .entry-source')].some((el) => el.textContent?.trim() === 'build'),
      null,
      { timeout: 15000 },
    );
    await sleep(400);

    const log = await page.evaluate(() => [...document.querySelectorAll('.log-panel .entry')].map((entry) => ({
      severity: entry.querySelector('.entry-severity')?.textContent?.trim() ?? '',
      source: entry.querySelector('.entry-source')?.textContent?.trim() ?? '',
      message: entry.querySelector('.entry-message')?.textContent?.trim() ?? '',
      hasDetail: entry.querySelector('.detail-toggle') != null || entry.querySelector('.entry-detail') != null,
    })));
    writeFileSync(`${OUT}build-log.json`, JSON.stringify(log, null, 1));
    console.log('Build log:');
    for (const entry of log) console.log(`  [${entry.severity}] ${entry.source}: ${entry.message.slice(0, 240)}`);

    const buildEntries = log.filter((entry) => entry.source === 'build');
    check('Build wrote a log entry', buildEntries.length > 0, `${buildEntries.length} build entries`);
    check('Build entry is an error', buildEntries.some((entry) => entry.severity === 'error'),
      buildEntries.map((entry) => entry.severity).join(', ') || 'none');
    check('Build never reports "Built FeatureScript"',
      !log.some((entry) => /Built FeatureScript/.test(entry.message)),
      log.filter((entry) => /Built FeatureScript/.test(entry.message)).map((entry) => entry.message).join('; ') || 'none');
    const errorEntry = buildEntries.find((entry) => entry.severity === 'error');
    check('Build error names the Define Feature / End Feature chain',
      errorEntry != null && /Define Feature/.test(errorEntry.message) && /End Feature/.test(errorEntry.message),
      errorEntry?.message ?? 'no error entry');
    check('no malformed source attached to the log',
      !log.some((entry) => entry.hasDetail) && !log.some((entry) => /FeatureScript \d+;[\s\S]*^\}\);$/m.test(entry.message)),
      log.filter((entry) => entry.hasDetail).map((entry) => entry.message).join('; ') || 'none');

    // 4: the generator itself must refuse, not resolve to a source string.
    const buildCall = await page.evaluate(async () => {
      try {
        const source = await window.controls.studioEvents.build();
        return { resolved: true, source: String(source ?? '') };
      } catch (error) {
        return { resolved: false, message: error instanceof Error ? error.message : String(error) };
      }
    });
    check('studioEvents.build() rejects the unwired graph', buildCall.resolved === false,
      buildCall.resolved ? `resolved with ${buildCall.source.length} bytes` : 'rejected');
    check('rejection is an actionable message, not source',
      buildCall.resolved === false && /Define Feature/.test(buildCall.message) && /End Feature/.test(buildCall.message)
        && !/FeatureScript \d+;/.test(buildCall.message),
      buildCall.resolved ? 'resolved' : buildCall.message);

    await page.screenshot({ path: `${OUT}build-validation.png` });
    check('no page errors', pageErrors.length === 0, pageErrors.join('; ') || 'none');
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  check('harness completed', false, error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  stopServer();
}

writeFileSync(`${OUT}result.json`, JSON.stringify({ url: URL, failures }, null, 1));
if (failures.length > 0) {
  console.log(`\nbuild-validation-check: ${failures.length} failure(s): ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nbuild-validation-check: Build refuses the unwired default graph');
