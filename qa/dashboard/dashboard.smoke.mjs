#!/usr/bin/env node
/**
 * Smoke test for the qa/dashboard Vite app (http, real clicks/typing).
 * Usage: node qa/dashboard/dashboard.smoke.mjs [--app dist/qa-dashboard] [--report qa/harness/sample-report.json]
 * Copies the built app into tmp/qa-runs/dashboard-smoke/, adds data/report.json
 * plus generated 1x1 PNGs for every referenced screenshot (storage only, no HTML
 * in tmp/ beyond the copied app under test), serves it over http, and exercises
 * every control. Prints PASS/FAIL; exits non-zero on failure.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const argv = process.argv.slice(2);
let appDir = null, reportPath = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--app') appDir = argv[++i];
  else if (argv[i] === '--report') reportPath = argv[++i];
}
appDir = path.resolve(appDir || 'dist/qa-dashboard');
reportPath = path.resolve(reportPath || 'qa/harness/sample-report.json');
const rootDir = path.resolve('tmp/qa-runs/dashboard-smoke');
const wwwDir = path.join(rootDir, 'www', 'qa');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

let failures = 0;
function check(name, cond, detail = '') { if (cond) console.log(`PASS ${name}${detail ? ' — ' + detail : ''}`); else { console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); failures++; } }
function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  for (const p of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome']) if (existsSync(p)) return p;
  for (const bin of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) for (const dir of (process.env.PATH || '').split(':')) { const p = path.join(dir, bin); if (existsSync(p)) return p; }
  return null;
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function main() {
  if (!existsSync(path.join(appDir, 'index.html'))) { console.log(`FAIL built dashboard missing: ${appDir} (run pnpm run build:qa-dashboard)`); process.exit(1); }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  mkdirSync(wwwDir, { recursive: true });
  cpSync(appDir, wwwDir, { recursive: true });
  mkdirSync(path.join(wwwDir, 'data'), { recursive: true });
  writeFileSync(path.join(wwwDir, 'data', 'report.json'), JSON.stringify(report, null, 2));
  for (const i of [...(report.issues || []), ...(report.actions || [])]) for (const k of ['screenshot', 'annotated']) {
    if (i[k]) { const p = path.join(wwwDir, 'data', i[k]); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, PNG); }
  }
  const wwwRoot = path.join(rootDir, 'www');
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let fp = path.join(wwwRoot, urlPath);
    if (urlPath.endsWith('/')) fp = path.join(fp, 'index.html');
    if (!fp.startsWith(wwwRoot) || !existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(readFileSync(fp));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const shotPath = path.join(rootDir, 'smoke.png');
  const exec = findChrome();
  if (!exec) { console.log('FAIL no Chrome binary; set CHROME_BIN'); server.close(); process.exit(1); }
  const browser = await chromium.launch({ executablePath: exec, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => console.log(`INFO pageerror: ${e.message}`));
  try {
    await page.goto(`http://127.0.0.1:${port}/qa/?report=data/report.json`);
    await page.waitForSelector('.card[data-severity]');
    const visibleCount = async () => page.evaluate(() => [...document.querySelectorAll('.card[data-severity]')].filter((c) => !c.hidden).length);
    const resultText = async () => (await page.locator('#result-count').textContent())?.trim() ?? '';
    await check('initial 4 cards', (await visibleCount()) === 4, `count=${await visibleCount()}`);
    await check('initial count text', (await resultText()) === 'Showing 4 of 4 issues', await resultText());
    await check('task section visible', await page.locator('.task').isVisible());
    await check('no broken placeholder images', (await page.evaluate(() => [...document.querySelectorAll('.card img')].filter((im) => im.complete && im.naturalWidth === 0).length)) === 0);
    await page.locator('[data-filter-group="severity"][data-filter-value="high"]').click();
    await check('high filter shows 2', (await visibleCount()) === 2, `count=${await visibleCount()}`);
    await page.locator('[data-filter-group="severity"][data-filter-value="high"]').click();
    await check('high toggle-off restores 4', (await visibleCount()) === 4, `count=${await visibleCount()}`);
    await page.locator('[data-filter-group="severity"][data-filter-value="high"]').click();
    await page.locator('[data-filter-group="severity"][data-filter-value="all"]').click();
    await check('severity All restores 4', (await visibleCount()) === 4, `count=${await visibleCount()}`);
    await check('severity All aria-pressed', (await page.locator('[data-filter-group="severity"][data-filter-value="all"]').getAttribute('aria-pressed')) === 'true');
    await page.locator('[data-filter-group="category"][data-filter-value="accessibility"]').click();
    await check('accessibility filter shows 1', (await visibleCount()) === 1, `count=${await visibleCount()}`);
    await page.locator('#clear-all').click();
    await check('clear all restores 4', (await visibleCount()) === 4, `count=${await visibleCount()}`);
    await page.locator('#q').fill('fillet');
    await check('search fillet shows 1', (await visibleCount()) === 1, `count=${await visibleCount()}`);
    await check('clear-q visible when non-empty', await page.locator('#clear-q').isVisible());
    await page.locator('#q').fill('zzz-no-match-xyz');
    await check('no-match shows 0', (await visibleCount()) === 0, `count=${await visibleCount()}`);
    await check('no-match message visible', await page.locator('#no-match').isVisible());
    await page.locator('#clear-filters').click();
    await check('clear-filters restores 4', (await visibleCount()) === 4, `count=${await visibleCount()}`);
    await page.locator('#q').fill('fillet'); await page.locator('#clear-q').click();
    await check('clear-q restores 4', (await visibleCount()) === 4, `count=${await visibleCount()}`);
    await page.locator('#q').fill('fillet'); await page.locator('#q').press('Escape');
    await check('escape restores 4', (await visibleCount()) === 4, `count=${await visibleCount()}`);
    await page.locator('[data-filter-group="severity"][data-filter-value="high"]').click();
    await page.locator('#q').fill('fillet');
    await check('combined high+fillet shows 1', (await visibleCount()) === 1, `count=${await visibleCount()}`);
    await page.locator('#clear-all').click();
    await check('clear all after combined restores 4', (await visibleCount()) === 4, `count=${await visibleCount()}`);
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.chip, #q, #clear-q, .search input')].map((el) => ({ id: el.id || el.textContent.trim(), h: el.getBoundingClientRect().height, visible: !el.hidden && el.offsetParent !== null })));
    await check('buttons/controls >=24px', sizes.filter((s) => s.visible && s.h < 24).length === 0, JSON.stringify(sizes));
    const totalStat = await page.locator('.card-stat').first().textContent();
    await check('summary stays total (4)', totalStat.trim().startsWith('4'), totalStat.trim());
    await page.screenshot({ path: shotPath });
    console.log(`INFO screenshot: ${shotPath}`);
  } finally { await browser.close(); server.close(); }
  console.log(failures ? `SUMMARY FAIL (${failures})` : 'SUMMARY PASS');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('SMOKE ERROR', e); process.exit(1); });
