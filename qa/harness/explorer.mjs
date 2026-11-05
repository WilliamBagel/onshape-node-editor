#!/usr/bin/env node
// UI explorer — breadth-first exploratory QA for the Onshape node editor.
// Implements docs/ui-explorer.md. Dev-only harness; no app source changes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  if (args.includes(`--${name}`)) return true;
  return fallback;
}
const flag = (n) => args.includes(`--${n}`);

const startedAt = Date.now();
const ts = new Date(startedAt).toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(arg('out', `tmp/qa-runs/${ts}`));
const url = arg('url', process.env.UI_URL || 'http://localhost:5173/onshape-node-editor/');
const taskId = arg('task', null) || null;
const maxActions = parseInt(arg('max-actions', '80'), 10) || 80;
const perActionTimeout = parseInt(arg('timeout', '30000'), 10) || 30000;
const headed = flag('headed');
const keepOpen = flag('keep-open');
// CI publishes findings without failing the deployment: the report is the
// product, and known product gaps are expected until they are fixed. A
// harness crash still exits 2.
const advisory = flag('advisory');

fs.mkdirSync(path.join(outDir, 'screenshots', 'actions'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'screenshots', 'issues'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'annotated'), { recursive: true });

function findChrome() {
  const explicit = arg('chrome', process.env.CHROME_BIN || '');
  if (explicit && typeof explicit === 'string') return explicit;
  if (fs.existsSync('/usr/bin/google-chrome-stable')) return '/usr/bin/google-chrome-stable';
  for (const bin of ['google-chrome-stable', 'chromium', 'google-chrome', 'chromium-browser']) {
    for (const dir of (process.env.PATH || '').split(':')) {
      const p = path.join(dir, bin);
      try { if (fs.existsSync(p)) return p; } catch {}
    }
  }
  throw new Error('no Chrome binary found; pass --chrome or CHROME_BIN');
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'x';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- state ----
const actions = [];
const issues = [];
const issueKeys = new Set();
const catCounts = {};
let actSeq = 0, issueSeq = 0;
let browser, context, page;
let currentConsoleErrors = [];
let taskResult = { id: taskId || null, name: taskId || null, status: 'skipped', steps: [], error: null };

page && 0; // noop
function viewport() { return { width: 1440, height: 900 }; }

function rel(p) { return path.relative(outDir, p).split(path.sep).join('/'); }

async function shotPath(kind, seq, name) {
  const dir = kind === 'issue' ? 'screenshots/issues' : kind === 'baseline' ? 'screenshots' : 'screenshots/actions';
  const file = kind === 'baseline' ? '00-baseline.png' : `${String(seq).padStart(3, '0')}-${slugify(name)}.png`;
  const full = path.join(outDir, dir, file);
  try { await page.screenshot({ path: full }); } catch (e) { console.warn(`screenshot failed: ${e.message}`); }
  return rel(full);
}

async function record(name, area, fn, { mutate = false, skipReason = null } = {}) {
  if (actions.length >= maxActions) return null;
  const id = `act-${String(++actSeq).padStart(3, '0')}`;
  currentConsoleErrors = [];
  const t0 = Date.now();
  let status = 'passed', error = null, changed = false, screenshot = null;
  if (skipReason) {
    status = 'skipped'; error = skipReason;
    screenshot = await shotPath('action', actSeq, name);
  } else {
    try {
      const before = await page.evaluate(() => ({ html: document.documentElement.outerHTML.length, nodes: document.querySelectorAll('.node').length, dialog: !!document.querySelector('[role=dialog]') })).catch(() => ({}));
      await Promise.race([fn(), sleep(perActionTimeout).then(() => { throw new Error('per-action timeout'); })]);
      await sleep(250);
      const after = await page.evaluate(() => ({ html: document.documentElement.outerHTML.length, nodes: document.querySelectorAll('.node').length, dialog: !!document.querySelector('[role=dialog]') })).catch(() => ({}));
      changed = before && after && (before.html !== after.html || before.nodes !== after.nodes || before.dialog !== after.dialog);
      screenshot = await shotPath('action', actSeq, name);
      if (currentConsoleErrors.length) {
        // console errors are recorded as issues via detector, not hard failures
      }
    } catch (e) {
      status = 'failed'; error = e.message.slice(0, 500);
      screenshot = await shotPath('action', actSeq, name);
    }
  }
  const rec = { id, name, area, status, durationMs: Date.now() - t0, changed, error, consoleErrors: [...currentConsoleErrors], screenshot };
  actions.push(rec);
  console.log(`${status.toUpperCase()} ${id} ${name} (${rec.durationMs}ms)`);
  if (mutate && !skipReason) await reload();
  return rec;
}

async function reload() {
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.waitForSelector('.node', { timeout: 15000 }).catch(() => {});
  await sleep(400);
}

async function addIssue({ title, severity = 'medium', category, area, description, expected, actual, steps, suggestion, bbox, actionId, console: cons = [], dedupLabel = '' }) {
  // The same DOM control is re-scanned after every action. Key on geometry when
  // no explicit label is supplied so one control yields one issue, not one per
  // screen tour (the area field may legitimately differ between tours).
  const geom = bbox ? `${bbox.x},${bbox.y},${bbox.width},${bbox.height}` : '';
  const key = `${category}|${title.toLowerCase()}|${dedupLabel || geom || title}`;
  if (issueKeys.has(key)) return null;
  if ((catCounts[category] || 0) >= 20) return null;
  issueKeys.add(key); catCounts[category] = (catCounts[category] || 0) + 1;
  const id = `ui-${String(++issueSeq).padStart(3, '0')}`;
  const screenshot = await shotPath('issue', issueSeq, title);
  issues.push({
    id, title, severity, category, area, description, expected, actual,
    steps, suggestion, screenshot, annotated: null,
    bbox: bbox ?? null,
    viewport: viewport(), actionId: actionId || null, console: cons,
  });
  console.log(`ISSUE ${id} [${severity}/${category}] ${title}`);
  return issues[issues.length - 1];
}

// ------------------------------------------------------------- detectors ----
const DETECTOR_JS = `(function(){
  const vw = window.innerWidth, vh = window.innerHeight;
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw; };
  const bbox = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; };
  const sel = (el) => (el.tagName||'').toLowerCase() + (el.id ? '#'+el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '');
  const interactives = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=menuitem], summary')].filter(vis);
  const out = { obscured: [], clipped: [], offviewport: [], noname: [], tiny: [], broken: [], contrast: [] };
  for (const el of interactives) {
    const r = el.getBoundingClientRect(); const cx = r.x + r.width/2, cy = r.y + r.height/2;
    if (cx >= 0 && cy >= 0 && cx < vw && cy < vh) {
      const top = document.elementFromPoint(cx, cy);
      const inOverlay = top && top.closest && top.closest('[data-testid="context-menu"], [role=dialog], .actions, .palette, .app-dialog-backdrop, .actions-backdrop, .palette-backdrop');
      if (top && top !== el && !el.contains(top) && !top.contains(el) && !inOverlay)
        out.obscured.push({ title: 'Control is covered by another element', selector: sel(el), label: (el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,60), bbox: bbox(el), covering: sel(top) });
    }
    if (r.x < -2 || r.y < -2 || r.right > vw + 2 || r.bottom > vh + 2)
      out.offviewport.push({ title: 'Control is partly outside the viewport', selector: sel(el), label: (el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,60), bbox: bbox(el) });
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || (el.textContent||'').trim() || (el.labels && el.labels[0] ? el.labels[0].textContent.trim() : '') || (el.querySelector('img') ? (el.querySelector('img').alt||'') : '')).trim();
    if (!name && !el.querySelector('[aria-label]'))
      out.noname.push({ title: 'Control has no accessible name', selector: sel(el), bbox: bbox(el) });
    if (r.width < 16 || r.height < 16) {
      const isToolbarIcon = el.classList.contains('toolbar-btn') && (el.getAttribute('title') || el.getAttribute('aria-label'));
      if (!isToolbarIcon) out.tiny.push({ title: 'Clickable target is smaller than 16x16px', selector: sel(el), label: (el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,60), bbox: bbox(el) });
    }
  }
  // text clipping: glyph rects (Range) vs element content box — scrollWidth
  // alone over-counts padding/letter-spacing for fitted short labels.
  for (const el of [...document.querySelectorAll('*')].filter(vis).slice(0, 1500)) {
    const s = getComputedStyle(el);
    if (!((s.overflow === 'hidden' || s.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 2 && el.clientHeight > 0)) continue;
    const txt = (el.textContent || '').trim(); if (!txt) continue;
    // only flag when an actual glyph overflows the element's own box
    let glyphOverflow = false;
    try {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const er = el.getBoundingClientRect();
      let tn; while ((tn = walker.nextNode())) {
        if (!tn.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(tn);
        for (const gr of range.getClientRects()) {
          if (gr.width > 0 && (gr.right > er.right + 2 || gr.left < er.left - 2)) { glyphOverflow = true; break; }
        }
        range.detach(); if (glyphOverflow) break;
      }
    } catch (e) { glyphOverflow = false; }
    if (glyphOverflow) out.clipped.push({ title: 'Text is clipped by its own box', selector: sel(el), label: txt.slice(0,60), bbox: bbox(el) });
  }
  // broken svg use / images
  for (const u of document.querySelectorAll('use')) {
    const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
    if (href.startsWith('#') && !document.querySelector(href)) out.broken.push({ title: 'Broken SVG reference', selector: 'use', label: href, bbox: bbox(u) });
  }
  for (const img of document.querySelectorAll('img')) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) out.broken.push({ title: 'Image did not load', selector: sel(img), label: img.getAttribute('src').slice(0,80), bbox: bbox(img) });
  }
  // contrast
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const lum = ({r,g,b}) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  let checked = 0;
  for (const el of [...document.querySelectorAll('button, a, span, div, p, h1, h2, h3, label, summary')].filter(vis)) {
    if (checked > 400) break;
    const txt = (el.childNodes && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) ? el.textContent.trim() : '';
    if (!txt) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) continue;
    let bg = null, node = el;
    while (node) { const c = parse(getComputedStyle(node).backgroundColor); if (c && c.a > 0.95) { bg = c; break; } node = node.parentElement; }
    if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    checked++;
    if (ratio < 4.5) out.contrast.push({ title: 'Text contrast below 4.5:1', selector: sel(el), label: txt.slice(0,60), bbox: bbox(el), ratio: Math.round(ratio*100)/100, color: cs.color });
  }
  return out;
})()`;

async function runDetectors(area, actionId, consoleErrors) {
  let found;
  try { found = await page.evaluate(DETECTOR_JS); } catch { return; }
  const mk = async (items, category, severity, description, expected, actualFn, suggestion, steps) => {
    for (const it of (items || []).slice(0, 20)) {
      await addIssue({ title: it.title, severity, category, area, description,
        expected, actual: actualFn(it), steps, suggestion, bbox: it.bbox, actionId, console: consoleErrors, dedupLabel: `${it.selector}|${it.label || ''}` });
    }
  };
  await mk(found.obscured, 'visual', 'high', 'A visible control cannot be clicked because another element sits on top of it.',
    'Every visible control can be clicked at its centre.', (it) => `elementFromPoint at the centre of ${it.label || it.selector} resolves to ${it.covering || 'another element'}, not the control.`,
    'Move the covering element away or lower its stacking order so the button beneath it can be clicked.',
    ['Open the area under test', 'Try to click the covered control', 'Notice nothing happens because the click lands on the element above it']);
  await mk(found.clipped, 'visual', 'medium', 'Text is cut off inside its own box and cannot be read.',
    'All text is fully visible or can be scrolled/wrapped to read it.', (it) => `"${it.label}" overflows its box (scrollWidth exceeds clientWidth) with hidden/ellipsis overflow.`,
    'Widen the label box, allow the text to wrap, or make the full text available on hover.',
    ['Look at the clipped label', 'Try to read the full text', 'Notice the end of the text is cut off']);
  await mk(found.offviewport, 'visual', 'medium', 'A control sits partly outside the visible window.',
    'All controls are fully inside the window.', (it) => `${it.label || it.selector} extends outside the viewport (bbox ${JSON.stringify(it.bbox)}).`,
    'Reposition or resize the control so it fits fully inside the window.',
    ['Open the area under test', 'Look for a control cut off at the window edge']);
  await mk(found.noname, 'accessibility', 'medium', 'A control has no name that assistive technology or a tooltip can announce.',
    'Every control has visible text, an aria-label, or a title.', (it) => `No text, aria-label, title, or labelled child found on ${it.selector}.`,
    'Give the control a short label describing what it does (visible text or aria-label).',
    ['Tab through the controls', 'Notice this control announces nothing']);
  await mk(found.tiny, 'accessibility', 'low', 'A clickable target is very small and hard to hit.',
    'Clickable targets are at least 16x16px.', (it) => `${it.label || it.selector} is ${it.bbox.width}x${it.bbox.height}px.`,
    'Enlarge the clickable area to at least 16x16px.',
    ['Try to click the small target', 'Notice it is hard to hit precisely']);
  await mk(found.broken, 'visual', 'high', 'An icon or image references something that does not exist, so it renders blank.',
    'Every icon and image loads and is visible.', (it) => `${it.label || it.selector} references a missing resource.`,
    'Fix the icon/image reference so the picture appears.',
    ['Look at the icon or image', 'Notice it is blank or missing']);
  await mk(found.contrast, 'accessibility', 'medium', 'Text is too faint against its background to read comfortably.',
    'Normal text has a contrast ratio of at least 4.5:1.', (it) => `"${it.label}" has contrast ${it.ratio}:1 (color ${it.color}).`,
    'Darken the text or lighten the background until the text is easy to read.',
    ['Read the faint text', 'Notice it is hard to make out against its background']);
  // console errors (resource-load lines are tracked separately with URLs)
  for (const e of (consoleErrors || [])) {
    if (/Failed to load resource/i.test(e)) continue;
    await addIssue({ title: 'Console error during interaction', severity: 'high', category: 'console', area,
      description: 'The app logged an error while this area was used.',
      expected: 'No console errors during normal use.', actual: e.slice(0, 300),
      steps: ['Use the area under test', 'Open the browser console and see the error'],
      suggestion: 'Fix the underlying error so nothing is logged to the console.',
      bbox: { x: 0, y: 0, width: 10, height: 10 }, actionId, console: [e] });
  }
}

async function assertDialogClosed(label, actionId) {
  const open = await page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    return {
      // only modal dialogs count: node headers also carry role="dialog"
      dialog: [...document.querySelectorAll('[role=dialog][aria-modal="true"]')].some(visible),
      backdrop: [...document.querySelectorAll('.app-dialog-backdrop, .actions-backdrop, .palette-backdrop')].some(visible),
      palette: [...document.querySelectorAll('.actions, .palette')].some(visible),
    };
  }).catch(() => ({ dialog: false, backdrop: false, palette: false }));
  if (open.dialog || open.backdrop || open.palette) {
    await addIssue({ title: 'Dialog still open after close', severity: 'medium', category: 'functional', area: 'settings',
      description: `After ${label}, a dialog or palette overlay is still on screen.`,
      expected: 'Closing the dialog removes it completely.', actual: `Still present: dialog=${open.dialog}, backdrop=${open.backdrop}, palette=${open.palette}.`,
      steps: [`Open the dialog`, `Close it (${label})`, 'Notice an overlay remains on screen'],
      suggestion: 'Make sure closing the dialog also removes its backdrop and overlay.',
      bbox: { x: 0, y: 0, width: 10, height: 10 }, actionId, console: [] });
  }
  return open;
}

// ----------------------------------------------------------------- tours ----
async function tourToolbar() {
  const btns = await page.$$('.toolbar-btn');
  for (const b of btns) {
    const label = (await b.getAttribute('aria-label')) || (await b.textContent()) || 'button';
    const unsafe = /upload|new graph|save file|open file/i.test(label);
    const rec = await record(`Toolbar: ${label}`, 'toolbar', async () => {
      if (unsafe) throw new Error('skipped'); // handled below
      await b.click({ timeout: 5000 });
      await sleep(400);
      await page.keyboard.press('Escape').catch(() => {});
    }, { skipReason: unsafe ? (/upload/i.test(label) ? 'Skipped: uploads to an external Onshape Feature Studio' : /new graph/i.test(label) ? 'Skipped: destructive overwrite of the current graph' : 'Skipped: opens a native file chooser') : null });
    if (rec && rec.status === 'passed') await runDetectors('toolbar', rec.id, rec.consoleErrors);
    if (actions.length >= maxActions) return;
  }
}

async function tourSettings() {
  const rec1 = await record('Settings: open dialog', 'settings', async () => {
    await page.click('button[aria-label="Settings"]', { timeout: 5000 });
    await page.waitForSelector('[role=dialog]', { timeout: 5000 });
  });
  if (!rec1 || rec1.status !== 'passed') return;
  // visit sections: toggle first checkbox and restore
  await record('Settings: toggle preference and restore', 'settings', async () => {
    const cb = await page.$('.settings-check');
    if (!cb) throw new Error('no settings checkbox found');
    await cb.click(); await sleep(200); await cb.click(); await sleep(200);
  });
  await record('Settings: close dialog', 'settings', async () => {
    await page.keyboard.press('Escape'); await sleep(300);
    let open = await page.evaluate(() => !!document.querySelector('[role=dialog]'));
    if (open) { await page.click('.app-dialog-btn--ghost', { timeout: 3000 }).catch(() => {}); await sleep(300); }
  });
  await assertDialogClosed('Escape/close button', rec1.id);
  await runDetectors('settings', rec1.id, rec1.consoleErrors);
}

async function openPalette(kind) {
  await page.keyboard.press(kind === 'actions' ? 'F3' : 'Shift+A');
  await sleep(600);
}
async function tourPalettes() {
  for (const kind of ['actions', 'palette']) {
    const area = kind === 'actions' ? 'palette' : 'palette';
    const sel = kind === 'actions' ? '.actions' : '.palette';
    const searchSel = kind === 'actions' ? '.actions-search' : '.palette-search';
    const itemSel = kind === 'actions' ? '.actions-item' : '.palette-item';
    const catSel = kind === 'actions' ? null : '.palette-category';
    const rec = await record(`${kind === 'actions' ? 'F3 action palette' : 'Shift+A add-node palette'}: open`, area, async () => {
      await openPalette(kind);
      await page.waitForSelector(sel, { timeout: 5000 }).catch(() => { throw new Error('palette did not open'); });
    });
    if (!rec || rec.status !== 'passed') continue;
    for (const q of ['chamfer', 'fillet', 'cylinder', 'math']) {
      await record(`Palette search: ${q}`, area, async () => {
        await page.fill(searchSel, q, { timeout: 3000 }); await sleep(400);
        const n = await page.$$eval(itemSel, (els) => els.length).catch(() => 0);
        if (n === 0) throw new Error(`no results for "${q}"`);
      });
      if (actions.length >= maxActions) break;
    }
    if (catSel) {
      const cats = await page.$$(catSel);
      for (let i = 0; i < Math.min(cats.length, 6); i++) {
        await record(`Palette category ${i + 1}`, area, async () => {
          await cats[i].click({ timeout: 3000 }); await sleep(300);
          await page.fill(searchSel, '', { timeout: 3000 }).catch(() => {}); await sleep(300);
        });
        if (actions.length >= maxActions) break;
      }
    }
    await record('Palette: close with Escape', area, async () => {
      await page.keyboard.press('Escape'); await sleep(300);
      const still = await page.evaluate((s) => !!document.querySelector(s), sel);
      if (still) throw new Error('palette still open after Escape');
    });
    await runDetectors(area, rec.id, rec.consoleErrors);
    if (actions.length >= maxActions) return;
  }
}

async function tourContextMenu() {
  await record('Context menu: right-click canvas', 'context-menu', async () => {
    // empty canvas below the node row (nodes end ~y=400 in the sample graph)
    const points = [[720, 600], [720, 500], [1200, 650], [200, 600]];
    let opened = false;
    for (const [x, y] of points) {
      await page.mouse.click(x, y, { button: 'right' });
      await sleep(500);
      const m = await page.$('[data-testid="context-menu"]');
      const hasSearch = m ? await m.$('[data-testid="context-menu-search-input"]') : null;
      if (m && hasSearch) { opened = true; break; }
      await page.keyboard.press('Escape').catch(() => {}); await sleep(200);
    }
    if (!opened) throw new Error('canvas context menu with search did not open');
  });
  const cats = await page.$$('[data-testid="context-menu"] .block.hasSubitems .content');
  for (let i = 0; i < Math.min(cats.length, 5); i++) {
    await record(`Context menu: open category ${i + 1} by click`, 'context-menu', async () => {
      await cats[i].click({ timeout: 3000 }); await sleep(400);
      const subs = await page.$$eval('[data-testid="context-menu"] .subitems', (els) => els.filter(e => e.offsetParent !== null).length).catch(() => 0);
      if (subs === 0) throw new Error('category did not open on click');
    });
    if (actions.length >= maxActions) break;
  }
  await record('Context menu: search leaf in subcategory', 'context-menu', async () => {
    const input = await page.$('[data-testid="context-menu-search-input"]');
    if (!input) throw new Error('no context menu search input');
    await input.fill('fillet'); await sleep(400);
    const n = await page.$$eval('[data-testid="context-menu"] .block', (els) => els.length).catch(() => 0);
    if (n === 0) throw new Error('no leaf results for "fillet"');
  });
  await record('Context menu: close with Escape', 'context-menu', async () => {
    await page.keyboard.press('Escape'); await sleep(300);
    await page.mouse.click(100, 100).catch(() => {}); await sleep(200);
  });
  await runDetectors('context-menu', null, []);
}

async function tourNodes() {
  const nodes = await page.$$('.node');
  const count = Math.min(nodes.length, 4);
  for (let i = 0; i < count; i++) {
    const idx = i;
    const hasHeader = await page.evaluate((n) => {
      const node = document.querySelectorAll('.node')[n];
      return node ? !!node.querySelector('.map-input-header') : false;
    }, idx).catch(() => false);
    await record(`Node ${idx + 1}: expand/collapse Definition`, 'node', async () => {
      const node = (await page.$$('.node'))[idx];
      const header = await node.$('.map-input-header');
      if (!header) throw new Error('no Definition header');
      await header.click({ timeout: 3000 }); await sleep(400);
      await header.click({ timeout: 3000 }); await sleep(400);
    }, { skipReason: hasHeader ? null : 'Skipped: this node has no Definition map' });
    await record(`Node ${idx + 1}: collapse node, sockets visible`, 'node', async () => {
      const node = (await page.$$('.node'))[idx];
      const toggle = await node.$('.node-collapse-toggle');
      if (!toggle) throw new Error('no collapse toggle');
      await toggle.click({ timeout: 3000 }); await sleep(400);
      const sockets = await node.$$eval('[data-testid="input-socket"],[data-testid="output-socket"],[data-testid="collapsed-input-socket"],[data-testid="collapsed-output-socket"]', (els) => els.filter(e => e.offsetParent !== null).length);
      if (sockets === 0) throw new Error('no sockets visible after collapse');
      await toggle.click({ timeout: 3000 }); await sleep(400);
    });
    await record(`Node ${idx + 1}: edit title and cancel`, 'node', async () => {
      const node = (await page.$$('.node'))[idx];
      const btn = await node.$('.node-title-edit-toggle');
      if (!btn) throw new Error('no title edit toggle');
      await btn.click({ timeout: 3000 }); await sleep(300);
      await page.keyboard.press('Escape'); await sleep(300);
    });
    // parameter controls present in this node
    await record(`Node ${idx + 1}: open parameter controls`, 'node', async () => {
      const node = (await page.$$('.node'))[idx];
      const header = await node.$('.map-input-header');
      if (header) { await header.click({ timeout: 3000 }).catch(() => {}); await sleep(300); }
      const ctrls = await node.$$('button, input, select');
      for (const c of ctrls.slice(0, 3)) { await c.click({ timeout: 2000 }).catch(() => {}); await sleep(200); }
      await page.keyboard.press('Escape').catch(() => {});
    });
    if (actions.length >= maxActions) return;
  }
  await runDetectors('node', null, []);
}

async function tourSockets() {
  await reload(); // node tour may leave collapsed/expanded state; start clean
  await record('Sockets: click output then input to connect', 'node', async () => {
    const pts = await page.evaluate(() => {
      const pick = (sel) => [...document.querySelectorAll(sel)]
        .map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.width > 0 && r.height > 0, node: e.closest('.node')?.dataset?.id || e.closest('.node')?.querySelector('.node-title')?.textContent?.trim() || '' }; })
        .filter((p) => p.visible);
      const outs = pick('[data-testid="output-socket"] .socket-container');
      const ins = pick('[data-testid="input-socket"] .socket-container');
      if (!outs.length || !ins.length) return null;
      const pairs = [];
      for (const out of outs.slice(0, 4)) for (const inp of ins.slice(0, 6)) {
        if (out.node !== inp.node) pairs.push({ out, inp });
        if (pairs.length >= 6) break;
      }
      return { pairs };
    });
    if (!pts) throw new Error('no visible sockets found');
    const count = () => page.$$eval('[data-testid="connection"]', (els) => els.length).catch(() => 0);
    let connected = false, pendingSeen = false;
    for (const pair of pts.pairs) {
      const before = await count();
      await page.mouse.click(pair.out.x, pair.out.y); await sleep(250);
      const pending = await count();
      if (pending > before) pendingSeen = true;
      await page.mouse.click(pair.inp.x, pair.inp.y); await sleep(400);
      const after = await count();
      // a completed connection persists; a pending wire is also counted, so
      // require the wire to still exist after a neutral click elsewhere
      if (after > before) {
        await page.mouse.click(640, 820); await sleep(300);
        if ((await count()) > before) { connected = true; break; }
      }
      await page.mouse.click(640, 820); await sleep(250); // cancel pending wire
    }
    if (!pendingSeen) throw new Error('clicking an output socket did not start a connection path');
    if (!connected) throw new Error('no compatible output/input pair connected (tried ' + pts.pairs.length + ' pairs)');
  }, { mutate: true });
}

async function tourFrameGroup() {
  await record('Frame: select nodes and frame them', 'group', async () => {
    const nodes = await page.$$('.node');
    if (nodes.length < 2) throw new Error('fewer than 2 nodes');
    await nodes[0].click({ timeout: 3000 }); await sleep(200);
    await page.keyboard.down('Shift'); await nodes[1].click({ timeout: 3000 }); await page.keyboard.up('Shift');
    await sleep(300);
    await page.keyboard.press('KeyF').catch(() => {});
    await sleep(500);
  }, { mutate: true });
  await record('Group: select, group, Tab in/out', 'group', async () => {
    const nodes = await page.$$('.node');
    if (nodes.length < 2) throw new Error('fewer than 2 nodes');
    await nodes[0].click({ timeout: 3000 }); await sleep(200);
    await page.keyboard.down('Shift'); await nodes[1].click({ timeout: 3000 }); await page.keyboard.up('Shift');
    await page.keyboard.press('Control+g'); await sleep(500);
    await page.keyboard.press('Tab'); await sleep(400);
    await page.keyboard.press('Escape'); await sleep(300);
  }, { mutate: true });
}

async function tourKeyboard() {
  for (const [name, key] of [['F3', 'F3'], ['Shift+A', 'Shift+a'], ['Ctrl+G', 'Control+g'], ['Ctrl+Shift+G', 'Control+Shift+g'], ['Tab', 'Tab'], ['Escape', 'Escape']]) {
    await record(`Keyboard: ${name}`, 'canvas', async () => {
      const before = await page.evaluate(() => document.documentElement.outerHTML.length);
      await page.keyboard.press(key); await sleep(400);
      await page.keyboard.press('Escape').catch(() => {}); await sleep(200);
      const after = await page.evaluate(() => document.documentElement.outerHTML.length);
      if (before === after) console.log(`  note: ${name} produced no DOM change`);
    });
    if (actions.length >= maxActions) return;
  }
}

async function tourSweep() {
  const items = await page.evaluate(() => {
    const sel = 'button, [role=button], [role=menuitem], summary, input[type=checkbox], .palette-item, .menu .block';
    return [...document.querySelectorAll(sel)]
      .map((el, i) => { const r = el.getBoundingClientRect(); return { i, label: (el.getAttribute('aria-label') || (el.textContent || '').trim()).slice(0, 50), x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 }; })
      .filter((x) => x.visible)
      .sort((a, b) => (a.label + a.i).localeCompare(b.label + b.i));
  }).catch(() => []);
  const covered = new Set(actions.map((a) => a.name));
  for (const it of items.slice(0, 30)) {
    if (actions.length >= maxActions) break;
    if (/upload|delete|overwrite|save|open file|new graph/i.test(it.label)) {
      await record(`Sweep: ${it.label || 'control'}`, 'canvas', async () => {}, { skipReason: 'Skipped: unsafe/external action' });
      continue;
    }
    if (covered.has(it.label)) continue;
    const rec = await record(`Sweep click: ${it.label || `control-${it.i}`}`, 'canvas', async () => {
      await page.mouse.click(it.x, it.y); await sleep(400);
      await page.keyboard.press('Escape').catch(() => {}); await sleep(150);
    }, { mutate: true });
    if (rec) await runDetectors('canvas', rec.id, rec.consoleErrors);
  }
}

// ------------------------------------------------------------------- main ----
async function main() {
  const { chromium } = await import('playwright-core');
  const chromeBin = findChrome();
  console.log(`browser: ${chromeBin} (headless=${!headed}) url=${url} out=${outDir}`);
  browser = await chromium.launch({ executablePath: chromeBin, headless: !headed, args: ['--no-sandbox', '--disable-gpu'] });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on('filechooser', async (fc) => { try { await fc.cancel(); } catch {} });
  const failedRequests = new Set();
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.add(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => failedRequests.add(`FAILED ${r.url()}`));
  page.on('console', (m) => { if (m.type() === 'error') currentConsoleErrors.push(m.text().slice(0, 500)); });
  page.on('pageerror', (e) => currentConsoleErrors.push(String(e).slice(0, 500)));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.node', { timeout: 20000 }).catch(() => {});
  await sleep(1000);
  const baselineShot = await shotPath('baseline', 0, 'baseline');
  const nodeCount = await page.$$eval('.node', (els) => els.length).catch(() => 0);
  actions.push({ id: `act-${String(++actSeq).padStart(3, '0')}`, name: 'Baseline: boot and render', area: 'canvas', status: nodeCount >= 1 ? 'passed' : 'failed', durationMs: 0, changed: false, error: nodeCount >= 1 ? null : `only ${nodeCount} nodes rendered`, consoleErrors: [...currentConsoleErrors], screenshot: baselineShot });
  console.log(`baseline: ${nodeCount} nodes`);
  await runDetectors('canvas', actions[actions.length - 1].id, currentConsoleErrors);

  // Optional task
  if (taskId) {
    const tasksPath = path.join(REPO, 'qa', 'harness', 'tasks.mjs');
    if (fs.existsSync(tasksPath)) {
      try {
        const mod = await import(pathToFileURL(tasksPath).href);
        const t = mod.tasks?.[taskId];
        if (!t) { taskResult = { id: taskId, name: taskId, status: 'failed', steps: [], error: `task "${taskId}" not found in tasks.mjs` }; }
        else {
          const steps = [];
          const ctx = {
            page, shot: async (n) => shotPath('action', actSeq, n), reload,
            log: (m) => console.log(`[task] ${m}`),
            record: (label, status, detail) => {
              const normalized = status === 'pass' ? 'passed' : status === 'fail' ? 'failed' : status === 'skip' ? 'skipped' : status;
              steps.push({ label: String(label), status: normalized, detail: detail ? String(detail) : '' });
            },
            assert: (cond, label) => { steps.push({ label, status: cond ? 'passed' : 'failed', detail: '' }); if (!cond) throw new Error(`assertion failed: ${label}`); },
            issue: (title, detail) => addIssue({
              title: String(title).slice(0, 120), severity: 'high', category: 'functional', area: 'task',
              description: 'A task step failed while exercising the UI.',
              expected: 'The step completes from the visible UI.',
              actual: String(detail || title).slice(0, 500),
              steps: [String(title)], suggestion: 'Fix the blocker shown in this task step so a user can complete the flow.',
              actionId: null, console: [],
            }),
          };
          try { await t.run(ctx); taskResult = { id: t.id, name: t.name, status: steps.some(s => s.status === 'failed') ? 'failed' : 'passed', steps, error: null }; }
          catch (e) { taskResult = { id: t.id, name: t.name, status: 'failed', steps, error: e.message.slice(0, 500) };
            await addIssue({ title: 'Task failed', severity: 'high', category: 'functional', area: 'task', description: `Task ${t.id} did not complete.`, expected: `Task ${t.id} completes.`, actual: e.message.slice(0, 300), steps: steps.map(s => s.label), suggestion: 'Fix the blocker shown in the task steps so the task can be completed from the UI.', actionId: null, console: [] }); }
        }
      } catch (e) { taskResult = { id: taskId, name: taskId, status: 'failed', steps: [], error: e.message.slice(0, 500) }; }
    } else {
      console.warn('warning: qa/harness/tasks.mjs not found; running exploration only');
      taskResult = { id: taskId, name: taskId, status: 'skipped', steps: [], error: 'tasks.mjs absent' };
    }
    await reload().catch(() => {});
  }

  const tours = [tourToolbar, tourSettings, tourPalettes, tourContextMenu, tourNodes, tourSockets, tourFrameGroup, tourKeyboard, tourSweep];
  for (const t of tours) {
    if (actions.length >= maxActions) break;
    try { await t(); } catch (e) { console.warn(`tour ${t.name} error: ${e.message}`); }
  }

  // failed network requests (e.g. 404 assets) as low-severity console issues
  for (const req of [...failedRequests].slice(0, 10)) {
    await addIssue({ title: 'Resource failed to load', severity: 'low', category: 'console', area: 'canvas',
      description: 'A network request made by the page failed.',
      expected: 'All resources load successfully.', actual: req,
      steps: ['Open the app', 'Watch the network tab for a failed request'],
      suggestion: 'Fix the missing resource or its URL so it loads.',
      actionId: null, console: [req] });
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    url, durationMs: Date.now() - startedAt,
    task: taskResult,
    summary: {
      actions: actions.length, issues: issues.length,
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
    },
    actions, issues,
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`wrote ${path.join(outDir, 'report.json')} actions=${actions.length} issues=${issues.length}`);

  // Annotate first, then report, so the dashboard sees issue.annotated paths.
  const annotateScript = path.join(REPO, 'qa', 'harness', 'annotate-ui-shots.py');
  if (fs.existsSync(annotateScript)) {
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync('python3', [annotateScript, '--report', path.join(outDir, 'report.json'), '--out', path.join(outDir, 'annotated')], { stdio: 'inherit' });
    } catch (e) { console.warn(`warning: annotator skipped: ${e.message}`); }
  }

  // No HTML generated into tmp/: dashboard is qa/dashboard Vite app loading report.json.
  // report.md is on-demand via qa/harness/report.mjs (pnpm run qa:report).

  if (!keepOpen) { await browser.close().catch(() => {}); }
  else console.log('keep-open: browser left running for debugging');

  const fatal = issues.some(i => i.severity === 'critical' || i.severity === 'high') || taskResult.status === 'failed';
  if (advisory && fatal) console.warn('advisory: findings recorded; not failing this run');
  process.exit(advisory ? 0 : fatal ? 1 : 0);
}

main().catch(async (e) => {
  console.error(`fatal: ${e.message}`);
  try { if (browser) await browser.close(); } catch {}
  // still write a minimal report if out dir exists
  try {
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), url, durationMs: Date.now() - startedAt, task: taskResult, summary: { actions: actions.length, issues: issues.length, critical: 0, high: 0, medium: 0, low: 0 }, actions, issues, harnessError: e.message.slice(0, 500) }, null, 2));
  } catch {}
  process.exit(2);
});
