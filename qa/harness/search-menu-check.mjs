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

  // Reset to the top first: after the wheel step the active row sits above
  // the viewport, and scroll-into-view then (correctly) scrolls up — which
  // made this assertion wheel-position-dependent. From the top, ArrowDown
  // deterministically scrolls down.
  await page.evaluate((sel) => { document.querySelector(sel).scrollTop = 0; }, listSel);
  await sleep(150);
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowDown');
  await sleep(350);
  const afterArrows = await measure();
  check(`${label}: ArrowDown scrolls the list`,
    afterArrows.list.scrollTop > 0,
    `scrollTop 0 -> ${afterArrows.list.scrollTop}`);
  check(`${label}: active row kept inside list after arrows`,
    afterArrows.active?.insideList === true,
    `insideList=${afterArrows.active?.insideList}`);
  await page.screenshot({ path: path.join(OUT, `${label.toLowerCase()}-after.png`) });

  await page.keyboard.press('Escape');
  await sleep(350);
  return { before, afterWheel, afterArrows };
}

const report = { url: URL, when: new Date().toISOString(), palettes: {} };

// --- exact adjacency: keyboard order must equal rendered (DOM) order ------
// NodePalette renders category groups (sorted by category, then name) while
// its search ranker returns a score-ordered list. Navigating the ranker made
// one ArrowDown jump thousands of rows away from the row visibly next to the
// active one, so every step here asserts the active row is the option
// immediately after the previously active option in DOM order.
async function readList(listSel, activeSel) {
  return page.evaluate(({ listSel, activeSel }) => {
    const list = document.querySelector(listSel);
    if (!list) return null;
    const rows = [...list.querySelectorAll('[role="option"]')];
    const active = document.querySelector(activeSel);
    return {
      ids: rows.map((r) => r.id),
      labels: rows.map((r) => (r.textContent ?? '').trim().slice(0, 24)),
      activeId: active?.id ?? null,
      index: active ? rows.indexOf(active) : -1,
      count: rows.length,
      scrollTop: list.scrollTop,
    };
  }, { listSel, activeSel });
}

async function adjacencyRun(label, { listSel, activeSel, searchSel, open, query = null }) {
  const reset = async () => {
    await page.keyboard.press('Escape');
    await sleep(300);
    await open();
    if (query != null) {
      await page.locator(searchSel).fill(query);
      await sleep(500);
    }
  };
  await reset();

  const first = await readList(listSel, activeSel);
  const tag = `${label}${query == null ? '' : ` [${query}]`}`;
  check(`${tag}: initial active row is the first rendered option`,
    first != null && first.index === 0 && first.activeId === first.ids[0],
    first && `index=${first.index} active=${first.activeId} first=${first.ids[0]}`);

  const down = Math.max(1, Math.min(10, (first?.count ?? 1) - 1));
  const visited = [first.index];
  let broke = null;
  for (let i = 0; i < down; i += 1) {
    const before = await readList(listSel, activeSel);
    await page.keyboard.press('ArrowDown');
    await sleep(80);
    const after = await readList(listSel, activeSel);
    visited.push(after.index);
    if (after.index !== before.index + 1 || after.activeId !== after.ids[after.index]) {
      broke = broke ?? `step ${i}: ${before.index} -> ${after.index} (${after.activeId} vs ${after.ids[after.index]})`;
    }
  }
  const contiguous = visited.every((v, i) => v === visited[0] + i);
  check(`${tag}: ArrowDown walks the next rendered option, no skipped index`,
    broke == null && contiguous,
    broke ?? `indices ${visited.join(',')} of ${first?.count}`);

  // ArrowUp retraces exactly those rows.
  const upIndices = [];
  let upBroke = null;
  for (let i = 0; i < down; i += 1) {
    const before = await readList(listSel, activeSel);
    await page.keyboard.press('ArrowUp');
    await sleep(80);
    const after = await readList(listSel, activeSel);
    upIndices.push(after.index);
    if (after.index !== before.index - 1) upBroke = upBroke ?? `step ${i}: ${before.index} -> ${after.index}`;
  }
  check(`${tag}: ArrowUp retraces the same rows`,
    upBroke == null && upIndices[upIndices.length - 1] === visited[0],
    upBroke ?? `indices ${upIndices.join(',')}`);

  // Mouse parked over the list: scrolling rows under a stationary pointer
  // must not re-target the active row, so each arrow still advances exactly
  // one row from the previous one.
  await reset();
  const box = await page.locator(listSel).boundingBox();
  await page.mouse.move(box.x + 12, box.y + 8);
  await page.mouse.move(box.x + 14, box.y + 10);
  await sleep(250);
  const hovered = await readList(listSel, activeSel);
  // Enough steps that the list scrolls under the parked pointer (rows are
  // ~34px, the viewport ~550px), which is exactly when the old
  // mouseenter handler re-targeted the active row.
  const mouseSteps = Math.max(1, Math.min(20, (hovered?.count ?? 1) - hovered.index - 1));
  const mouseVisited = [hovered.index];
  let mouseBroke = null;
  for (let i = 0; i < mouseSteps; i += 1) {
    const before = await readList(listSel, activeSel);
    await page.keyboard.press('ArrowDown');
    await sleep(120);
    const after = await readList(listSel, activeSel);
    mouseVisited.push(after.index);
    if (after.index !== before.index + 1) {
      mouseBroke = mouseBroke ?? `step ${i}: ${before.index} -> ${after.index} (pointer parked at ${Math.round(box.x + 14)},${Math.round(box.y + 10)}, scrollTop ${after.scrollTop})`;
    }
  }
  check(`${tag}: mouse parked over the list — each arrow still steps one row`,
    mouseBroke == null && mouseVisited.every((v, i) => v === mouseVisited[0] + i),
    mouseBroke ?? `hover row ${hovered.index}, indices ${mouseVisited.join(',')}`);
  await page.mouse.move(1200, 860);
  await sleep(150);
  await page.keyboard.press('Escape');
  await sleep(300);
}


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

// Adjacency runs: empty and filtered queries, both palettes. NodePalette is
// the one with a grouped DOM order (the bug); ActionPalette renders its
// results 1:1, so the same assertions document that it stays correct.
const openNodePalette = async () => {
  await page.mouse.click(640, 420);
  await sleep(200);
  await page.keyboard.press('Shift+A');
  await sleep(700);
};
const openActionPalette = async () => {
  await page.keyboard.press('F3');
  await sleep(700);
};

await adjacencyRun('NodePalette', {
  listSel: '.palette-list', activeSel: '.palette-item--active', searchSel: '.palette-search', open: openNodePalette,
});
await adjacencyRun('NodePalette', {
  listSel: '.palette-list', activeSel: '.palette-item--active', searchSel: '.palette-search', open: openNodePalette, query: 'fillet',
});
await adjacencyRun('ActionPalette', {
  listSel: '.actions-list', activeSel: '.actions-item--active', searchSel: '.actions-search', open: openActionPalette,
});
await adjacencyRun('ActionPalette', {
  listSel: '.actions-list', activeSel: '.actions-item--active', searchSel: '.actions-search', open: openActionPalette, query: 'query',
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

// Keyboard/aria section (menu-a11y fixes): the context menu is a real
// keyboard menu, both palettes close with Escape from a row-button focus,
// and the toolbar Run button gets a visible :focus-visible ring.
await page.mouse.click(700, 450, { button: 'right' });
await sleep(800);
const kb = page.locator('[rete-context-menu]');
if (await kb.count()) {
  const role = await kb.getAttribute('role');
  const ad0 = await kb.getAttribute('aria-activedescendant');
  check('ContextMenu keyboard: role=menu', role === 'menu', `role=${role}`);
  check('ContextMenu keyboard: aria-activedescendant set', !!ad0, `ad=${ad0}`);
  await page.keyboard.press('ArrowDown');
  await sleep(250);
  const ad1 = await kb.getAttribute('aria-activedescendant');
  check('ContextMenu keyboard: ArrowDown moves active item', ad1 !== ad0, `${ad0} -> ${ad1}`);
  await page.keyboard.press('Escape');
  await sleep(400);
  check('ContextMenu keyboard: Escape closes menu',
    (await page.locator('[rete-context-menu]').count()) === 0);
  const focusTag = await page.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className);
  check('ContextMenu keyboard: focus returns to canvas', focusTag === 'MAIN.rete', `active=${focusTag}`);
}

for (const [label, openKey, panelSel, itemSel] of [
  ['NodePalette', 'Shift+A', '.palette', '.palette-item'],
  ['ActionPalette', 'F3', '.actions', '.actions-item'],
]) {
  await page.keyboard.press(openKey);
  await sleep(700);
  await page.keyboard.press('Tab'); // search input -> first row button
  await sleep(250);
  const focusedCls = await page.evaluate(() => document.activeElement?.className);
  check(`${label} keyboard: Tab reaches a row button`, (focusedCls ?? '').includes('item'), `focus=${focusedCls}`);
  await page.keyboard.press('Escape');
  await sleep(400);
  check(`${label} keyboard: Escape closes from row button`,
    (await page.locator(panelSel).count()) === 0);
}

// Toolbar focus ring: focus Run programmatically, then Tab away and
// Shift+Tab back — a keyboard-initiated move, so Run matches
// :focus-visible. (Tab on body/canvas is group-edit by design (#14), and a
// bare programmatic focus() does not set the :focus-visible modality.)
await page.evaluate(() => document.querySelector('.toolbar-btn--primary').focus());
await page.keyboard.press('Tab');
await sleep(200);
await page.keyboard.press('Shift+Tab');
await sleep(200);
let ring = await page.evaluate(() => {
  const el = document.activeElement;
  const f = el && el.classList?.contains('toolbar-btn--primary') ? getComputedStyle(el) : null;
  return f ? { fv: el.matches(':focus-visible'), fs: f.outlineStyle, fw: f.outlineWidth, fc: f.outlineColor, fo: f.outlineOffset } : null;
});
const ringUnfocused = await page.evaluate(() => {
  const el = document.querySelector('.toolbar-btn--primary');
  el.blur();
  return getComputedStyle(el).outlineStyle;
});
check('Toolbar ring: Run focus-visible outline 2px solid steel',
  ring != null && ring.fv && ring.fs === 'solid' && ring.fw === '2px' && ring.fc === 'rgb(47, 95, 143)' && ring.fo === '2px',
  JSON.stringify(ring));
check('Toolbar ring: focused differs from unfocused', ringUnfocused === 'none' && ring?.fs !== ringUnfocused);

report.results = results;
report.passed = results.every((r) => r.ok);
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed. Report: ${path.join(OUT, 'report.json')}`);
await browser.close();
process.exit(report.passed ? 0 : 1);
