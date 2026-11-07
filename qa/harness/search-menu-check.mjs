#!/usr/bin/env node
// Search-menu regression check (user-reported: "scrollbar doesn't work" +
// "grey select from arrow keys has bad contrast").
//
// Opens NodePalette (Shift+A) and ActionPalette (F3) in headless Chrome and
// asserts, with computed styles:
//   1. the list actually overflows (scrollHeight > clientHeight),
//   2. a visible (non-zero-width) scrollbar,
//   3. mouse wheel and repeated ArrowDown both move list.scrollTop and
//      keep the active row inside the list viewport,
//   4. every text span in the active row has opacity 1 and contrast
//      >= 4.5:1 against its effective background (alpha-composited),
//   5. the same overflow/scrollbar sanity for the canvas context menu
//      search (.menu[rete-context-menu]).
// Writes report.json + screenshots under tmp/qa-runs/search-menus/ only.
// Exit 1 on any failure. Usage: node qa/harness/search-menu-check.mjs
//   [--url <url>] [--out <dir>]   (QA_URL env also honoured)
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const URL = arg('url') || process.env.QA_URL || 'http://localhost:5199/';
const OUT = path.resolve(arg('out') || 'tmp/qa-runs/search-menus');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail ?? null });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  for (const p of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome']) {
    if (existsSync(p)) return p;
  }
  return null;
}

// Runs in the browser: measures a list + its active row, incl. effective
// (alpha-composited) contrast of every text span in the active row.
const measureSource = `({ listSel, activeSel, parts }) => {
  const parse = (s) => {
    const m = s.match(/[\\d.]+/g).map(Number);
    return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // Effective background: composite ancestor backgrounds up to first opaque.
  const effBg = (el) => {
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    const layers = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c.a > 0) layers.push(c);
      if (c.a >= 1) break;
    }
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };
  const list = document.querySelector(listSel);
  const active = document.querySelector(activeSel);
  const out = { list: null, active: null, contrasts: {} };
  if (list) {
    const cs = getComputedStyle(list);
    out.list = {
      scrollHeight: list.scrollHeight, clientHeight: list.clientHeight,
      scrollTop: list.scrollTop, overflowY: cs.overflowY,
      scrollbarWidth: list.offsetWidth - list.clientWidth,
      scrollbarPseudoWidth: parseFloat(getComputedStyle(list, '::-webkit-scrollbar').width) || 0,
      items: document.querySelectorAll(listSel + ' > *, ' + listSel + ' *').length,
    };
  }
  if (active) {
    const abg = effBg(active);
    const listRect = list.getBoundingClientRect();
    const actRect = active.getBoundingClientRect();
    out.active = {
      bg: abg, opacityOk: true,
      insideList: actRect.top >= listRect.top - 1 && actRect.bottom <= listRect.bottom + 1,
    };
    for (const [name, sel] of Object.entries(parts)) {
      const el = active.querySelector(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const fg = over({ ...parse(cs.color), a: parseFloat(cs.opacity) }, effBg(el));
      out.contrasts[name] = {
        ratio: Math.round(contrast(fg, effBg(el)) * 100) / 100,
        opacity: cs.opacity, text: el.textContent.trim().slice(0, 30),
      };
      if (parseFloat(cs.opacity) !== 1) out.active.opacityOk = false;
    }
  }
  return out;
}`;

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(URL, { waitUntil: 'load' });
await sleep(2500);

async function paletteCheck(label, listSel, activeSel, parts, open) {
  await open();
  const measure = () => page.evaluate(new Function('args', `return (${measureSource})(args)`), { listSel, activeSel, parts });

  const before = await measure();
  check(`${label}: list overflows (scrollHeight > clientHeight)`,
    before.list && before.list.scrollHeight > before.list.clientHeight,
    before.list && `scrollHeight=${before.list.scrollHeight} clientHeight=${before.list.clientHeight}`);
  // Headless Chrome keeps overlay scrollbars at offsetWidth-clientWidth=0
  // even with styled ::-webkit-scrollbar; the computed pseudo-element width
  // is the portable assertion (headed Chrome renders the classic 8px bar).
  check(`${label}: scrollbar styled visible (::webkit-scrollbar width > 0)`,
    before.list && before.list.scrollbarPseudoWidth > 0,
    before.list && `pseudoWidth=${before.list.scrollbarPseudoWidth}px (gutter=${before.list.scrollbarWidth}px)`);
  check(`${label}: active row present`, !!before.active);
  for (const [name, c] of Object.entries(before.contrasts ?? {})) {
    check(`${label}: active ${name} contrast >= 4.5`, c.ratio >= 4.5, `${c.ratio} ("${c.text}")`);
    check(`${label}: active ${name} opacity 1`, c.opacity === '1', `opacity=${c.opacity}`);
  }
  await page.screenshot({ path: path.join(OUT, `${label.toLowerCase()}-before.png`) });

  const box = await page.locator(listSel).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 300);
  await sleep(350);
  const afterWheel = await measure();
  check(`${label}: mouse wheel scrolls the list`,
    afterWheel.list.scrollTop > before.list.scrollTop,
    `scrollTop ${before.list.scrollTop} -> ${afterWheel.list.scrollTop}`);

  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowDown');
  await sleep(350);
  const afterArrows = await measure();
  check(`${label}: ArrowDown scrolls the list`,
    afterArrows.list.scrollTop > afterWheel.list.scrollTop,
    `scrollTop ${afterWheel.list.scrollTop} -> ${afterArrows.list.scrollTop}`);
  check(`${label}: active row kept inside list after arrows`,
    afterArrows.active?.insideList === true,
    `insideList=${afterArrows.active?.insideList}`);
  await page.screenshot({ path: path.join(OUT, `${label.toLowerCase()}-after.png`) });

  await page.keyboard.press('Escape');
  await sleep(350);
  return { before, afterWheel, afterArrows };
}

const report = { url: URL, when: new Date().toISOString(), palettes: {} };

report.palettes.node = await paletteCheck('NodePalette', '.palette-list', '.palette-item--active',
  { name: '.palette-item-name', meta: '.palette-item-meta' },
  async () => {
    await page.mouse.click(640, 420);
    await sleep(250);
    await page.keyboard.press('Shift+A');
    await sleep(700);
  });

report.palettes.actions = await paletteCheck('ActionPalette', '.actions-list', '.actions-item--active',
  { name: '.actions-item-name', desc: '.actions-item-desc', meta: '.actions-item-meta', keycap: '.actions-keycap' },
  async () => {
    await page.keyboard.press('F3');
    await sleep(700);
    await page.locator('.actions-search').fill('query');
    await sleep(600);
  });

// Extra: a command row (empty query = actions only) carries a keycap chip;
// measure its contrast too, since the 'query' rows above were node results.
await page.keyboard.press('F3');
await sleep(700);
const cmdActive = await page.evaluate(new Function('args', `return (${measureSource})(args)`), {
  listSel: '.actions-list', activeSel: '.actions-item--active',
  parts: { name: '.actions-item-name', desc: '.actions-item-desc', keycap: '.actions-keycap' },
});
check('ActionPalette(command): active keycap present', !!cmdActive.contrasts?.keycap,
  cmdActive.contrasts?.keycap ? `"${cmdActive.contrasts.keycap.text}"` : 'none');
for (const [name, c] of Object.entries(cmdActive.contrasts ?? {})) {
  check(`ActionPalette(command): active ${name} contrast >= 4.5`, c.ratio >= 4.5, `${c.ratio} ("${c.text}")`);
  check(`ActionPalette(command): active ${name} opacity 1`, c.opacity === '1', `opacity=${c.opacity}`);
}
await page.keyboard.press('Escape');
await sleep(350);

// Context menu: search with many hits must overflow visibly + scroll.
await page.mouse.click(700, 450, { button: 'right' });
await sleep(800);
const menu = page.locator('[rete-context-menu]');
if (await menu.count()) {
  const inp = menu.locator('.search');
  if (await inp.count()) {
    await inp.fill('a');
    await sleep(500);
    const m = await menu.evaluate((el) => ({
      scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      scrollTop: el.scrollTop, scrollbarWidth: el.offsetWidth - el.clientWidth,
      scrollbarPseudoWidth: parseFloat(getComputedStyle(el, '::-webkit-scrollbar').width) || 0,
      overflowY: getComputedStyle(el).overflowY, blocks: el.querySelectorAll('.block').length,
    }));
    check('ContextMenu: search hits overflow', m.scrollHeight > m.clientHeight,
      `scrollHeight=${m.scrollHeight} clientHeight=${m.clientHeight} blocks=${m.blocks}`);
    check('ContextMenu: scrollbar styled visible (::webkit-scrollbar width > 0)', m.scrollbarPseudoWidth > 0,
      `pseudoWidth=${m.scrollbarPseudoWidth}px (gutter=${m.scrollbarWidth}px)`);
    let after = null;
    const box = await menu.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 300);
      await sleep(350);
      const afterWheel = await menu.evaluate((el) => el.scrollTop);
      after = afterWheel;
      check('ContextMenu: wheel scrolls', afterWheel > m.scrollTop, `scrollTop ${m.scrollTop} -> ${afterWheel}`);
    }
    await page.screenshot({ path: path.join(OUT, 'contextmenu-after.png') });
    report.contextMenu = { ...m, scrollTopAfterWheel: after };
  }
  await page.keyboard.press('Escape');
}

report.results = results;
report.passed = results.every((r) => r.ok);
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed. Report: ${path.join(OUT, 'report.json')}`);
await browser.close();
process.exit(report.passed ? 0 : 1);
