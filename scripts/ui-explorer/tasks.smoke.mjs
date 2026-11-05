/**
 * TEST-ONLY throwaway driver for scripts/ui-explorer/tasks.mjs.
 *
 * Launches Chromium via playwright-core, opens the dev server, and runs
 * every exported task with a minimal ctx (page, log, record, shot,
 * reload). NOT part of the explorer harness and NOT imported by it.
 *
 * playwright-core resolution: tries the normal `playwright-core` import
 * (provided by `pnpm install`, per package.json devDependencies); if that
 * fails (e.g. a worktree without its own node_modules), falls back to a
 * standalone install under the scratch dir, then to the main checkout.
 *
 * Usage:
 *   node scripts/ui-explorer/tasks.smoke.mjs [--url http://localhost:5173/onshape-node-editor/]
 *                                            [--out tmp/ui-task-smoke]
 * Exit code is non-zero if any task throws (i.e. any step failed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = arg('url', process.env.UI_URL || 'http://localhost:5173/onshape-node-editor/');
const outDir = path.resolve(arg('out', 'tmp/ui-task-smoke'));
fs.mkdirSync(outDir, { recursive: true });

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  const candidates = [
    '/home/willi/.hermes/cache/scratch/pw/node_modules/playwright-core',
    path.resolve(process.cwd(), '../../node_modules/playwright-core'),
    path.resolve(process.cwd(), '../../../node_modules/playwright-core'),
  ];
  let lastErr;
  for (const c of candidates) {
    try {
      const req = createRequire(path.join(c, 'package.json'));
      ({ chromium } = req('playwright-core'));
      console.log(`playwright-core fallback: ${c}`);
      break;
    } catch (e) { lastErr = e; }
  }
  if (!chromium) throw lastErr || new Error('playwright-core not found');
}

const { tasks } = await import('./tasks.mjs');

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

const results = [];
for (const task of tasks) {
  console.log(`\n=== TASK ${task.id} — ${task.name} ===`);
  const records = [];
  const ctx = {
    page,
    log: (m) => console.log(`  [log] ${m}`),
    record: (label, status, detail) => {
      records.push({ label, status, detail });
      console.log(`  ${status.toUpperCase().padEnd(4)} ${label}${detail ? ` — ${detail}` : ''}`);
    },
    shot: async (name) => {
      const p = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: p });
      console.log(`  SHOT ${p}`);
      return p;
    },
    reload: async () => {
      await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1500);
    },
  };
  // Fresh page load per task so tasks start from the sample graph.
  await ctx.reload();
  let verdict = 'PASS';
  try {
    await task.run(ctx);
  } catch (e) {
    verdict = 'FAIL';
    console.log(`  TASK THREW: ${e.message}`);
  }
  results.push({ id: task.id, verdict, records });
  console.log(`=== ${task.id}: ${verdict} (${records.filter((r) => r.status === 'fail').length} failed step(s)) ===`);
}

await browser.close();
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ url, results }, null, 2));
console.log(`\nreport: ${path.join(outDir, 'report.json')}`);
process.exit(results.some((r) => r.verdict !== 'PASS') ? 1 : 0);
