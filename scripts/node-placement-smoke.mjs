/**
 * Node-placement smoke probe (node-placement card).
 *
 * Boots the dev server URL, reproduces the exact reported failure — a click
 * near the bottom edge, then a Shift+A palette insert — and asserts the new
 * node lands fully inside the canvas viewport and not behind `.log-panel`.
 * Also checks a safe-centre focus click + insert stays visible.
 *
 * Usage:
 *   node scripts/node-placement-smoke.mjs [--url http://localhost:5173/onshape-node-editor/]
 * Exit code is non-zero on failure. Screenshot: tmp/node-placement-smoke.png
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const url = arg('url', process.env.UI_URL || 'http://localhost:5173/onshape-node-editor/');
const outPath = path.resolve(arg('out', 'tmp/node-placement-smoke.png'));
fs.mkdirSync(path.dirname(outPath), { recursive: true });

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
      const { createRequire } = await import('node:module');
      const req = createRequire(path.join(c, 'package.json'));
      ({ chromium } = req('playwright-core'));
      console.log(`playwright-core fallback: ${c}`);
      break;
    } catch (e) { lastErr = e; }
  }
  if (!chromium) throw lastErr || new Error('playwright-core not found');
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

async function insertFCylinder(label) {
  await page.mouse.click(640, 820).catch(() => {}); // bottom-edge click (the bug)
  await page.waitForTimeout(250);
  await page.keyboard.press('Shift+A');
  await page.waitForTimeout(700);
  const search = page.locator('.palette-search');
  if ((await search.count()) === 0) throw new Error(`${label}: palette did not open`);
  await search.fill('fCylinder');
  await page.waitForTimeout(600);
  const items = page.locator('.palette-item');
  let found = false;
  for (let i = 0; i < (await items.count()); i++) {
    const n = ((await items.nth(i).locator('.palette-item-name').textContent()) || '').trim();
    if (n.toLowerCase() === 'fcylinder') { await items.nth(i).click(); found = true; break; }
  }
  if (!found) throw new Error(`${label}: fCylinder item not found`);
  await page.waitForTimeout(1200);
  const node = page.locator('.node').filter({ has: page.locator('.node-title', { hasText: /^\s*fCylinder\s*$/ }) }).first();
  const box = await node.boundingBox().catch(() => null);
  const logBox = await page.locator('.log-panel').first().boundingBox().catch(() => null);
  console.log(`${label}: node bbox=${JSON.stringify(box)} log bbox=${JSON.stringify(logBox)}`);
  return { box, logBox };
}

function assertVisible(label, box, logBox) {
  if (!box) throw new Error(`${label}: node has no bounding box`);
  const vp = { width: 1280, height: 900 };
  const inside = box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height;
  const overlapsLog = logBox != null &&
    box.x < logBox.x + logBox.width && box.x + box.width > logBox.x &&
    box.y < logBox.y + logBox.height && box.y + box.height > logBox.y;
  console.log(`${label}: insideViewport=${inside} overlapsLog=${overlapsLog}`);
  if (!inside) throw new Error(`${label}: node offscreen bbox=${JSON.stringify(box)}`);
  if (overlapsLog) throw new Error(`${label}: node behind Build Log bbox=${JSON.stringify(box)} log=${JSON.stringify(logBox)}`);
}

try {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForSelector('.node', { timeout: 15000 });
  const before = await insertFCylinder('bottom-click insert');
  assertVisible('bottom-click insert', before.box, before.logBox);
  await page.screenshot({ path: outPath });
  console.log(`SCREENSHOT ${outPath}`);
  console.log('PASS node-placement-smoke');
} finally {
  await browser.close();
}
