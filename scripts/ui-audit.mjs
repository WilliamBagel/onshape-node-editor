// Headless UI audit harness for the Onshape node editor.
//
// Extends the raw-CDP approach of scripts/ui-verify.mjs (no Playwright /
// Puppeteer) to automatically check the user-visible defects reported
// against the editor. Every check prints PASS / FAIL / SKIPPED with the
// measured values behind the verdict, writes PNG screenshots plus
// report.json to the output directory, and the process exits non-zero
// if any check FAILs. A check that cannot be made reliable headlessly is
// reported SKIPPED with the reason — never a false PASS.
//
// Usage:
//   node scripts/ui-audit.mjs [--url http://localhost:5173/onshape-node-editor/]
//                             [--out tmp/ui-audit] [--chrome /path/to/chrome]
//
// The dev server must already be running (pnpm run dev). Chrome is found
// at google-chrome-stable / chromium / google-chrome; override with
// --chrome or CHROME_BIN.
//
// Checks (each guards its CSS selectors with el.matches(sel) before
// trusting computed styles — a selector that matches nothing makes the
// stylesheet look correct while the rendered UI is not):
//   1. map-header-left-aligned      Definition/map header is left-aligned,
//                                   not centered.
//   2. empty-definition-label       An empty Definition shows an explicit
//                                   empty-state label, not a blank area.
//   3. collapse-keeps-sockets       Collapsing a node keeps its input /
//                                   output sockets in the DOM and
//                                   connectable-looking (counted before
//                                   and after).
//   4. context-menu-click-open      Context-menu options do not auto-open
//                                   a submenu on hover; a category opens
//                                   only on click and its child list is
//                                   visible (and scrollable when long).
//   5. palette-search-features      F3 / Shift+A palette search finds
//                                   'chamfer' and other Onshape features.
//   6. frame-encloses-selection     Frame creation from selected nodes
//                                   produces a frame whose measured
//                                   width/height encloses the selected
//                                   node bounds with padding, including
//                                   an expanded Definition.
//   7. frame-below-connection       Frame background does not paint over
//                                   an existing connection (probed with
//                                   elementFromPoint along the wire and
//                                   DOM stacking order).
//   8. socket-anchor-points         Socket connection start/end point
//                                   matches the clicked socket's center
//                                   before any node has been moved, for
//                                   both click-from-output and
//                                   click-from-input.
//   9. title-edit-outline           Title edit has no saturated blue
//                                   outline (STYLE_GUIDE bans saturated
//                                   blue chrome; focus accent is the
//                                   desaturated steel blue #2f5f8f).

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const url = arg('url', process.env.UI_URL || 'http://localhost:5173/onshape-node-editor/');
const outDir = path.resolve(arg('out', 'tmp/ui-audit'));
const chromeBin = arg('chrome', process.env.CHROME_BIN || '');

fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- Chrome --

function findChrome() {
  if (chromeBin) return chromeBin;
  for (const bin of ['google-chrome-stable', 'chromium', 'google-chrome', 'chromium-browser']) {
    const r = spawn('which', [bin]);
    // synchronous-ish probe via PATH scan below instead
    void r;
  }
  for (const bin of ['google-chrome-stable', 'chromium', 'google-chrome', 'chromium-browser']) {
    for (const dir of (process.env.PATH || '').split(':')) {
      const p = path.join(dir, bin);
      try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
    }
  }
  throw new Error('no Chrome binary found; pass --chrome or CHROME_BIN');
}

const port = 9333 + Math.floor(Math.random() * 1000);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-audit-'));
const chrome = spawn(findChrome(), [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1280,900',
  '--force-device-scale-factor=1', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function waitPort() {
  for (let i = 0; i < 50; i++) {
    try {
      await new Promise((res, rej) => {
        const s = net.connect(port, '127.0.0.1');
        s.on('connect', () => { s.end(); res(); });
        s.on('error', rej);
      });
      return;
    } catch { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('Chrome did not open its DevTools port');
}

let ws, msgId = 0;
const pending = new Map();
function connect() {
  return new Promise(async (resolve) => {
    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    ws = new WebSocket(ver.webSocketDebuggerUrl);
    await once(ws, 'open');
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    resolve();
  });
}
function sendRaw(method, params = {}, sessionId) {
  return new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    setTimeout(() => rej(new Error(`timeout ${method}`)), 30000);
  });
}

let sessionId;
const cdp = {
  send: (m, p = {}) => sendRaw(m, p, sessionId),
  evaluate: async (expr) => {
    const r = await sendRaw('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result.result.value;
  },
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  shot: async (name) => {
    const { result } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(outDir, name);
    fs.writeFileSync(p, Buffer.from(result.data, 'base64'));
    console.log(`SHOT  ${p}`);
    return p;
  },
  keys: async (key, { modifiers = 0, text } = {}) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, modifiers, text: text ?? key });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, modifiers });
  },
  click: async (x, y, { button = 'left', modifiers = 0, count = 1 } = {}) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, modifiers, clickCount: count });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, modifiers, clickCount: count });
  },
  move: async (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }),
};

// -------------------------------------------------------------- reporting --

const checks = [];
function record(id, status, detail) {
  checks.push({ id, status, detail });
  console.log(`${status === 'SKIPPED' ? 'SKIP' : status}  ${id} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
}
function pass(id, detail) { record(id, 'PASS', detail); }
function fail(id, detail) { record(id, 'FAIL', detail); }
function skip(id, reason) { record(id, 'SKIPPED', reason); }
const fmt = (detail) => (typeof detail === 'string' ? detail : JSON.stringify(detail));

// ------------------------------------------------------------------ boot --

await waitPort();
await connect();
const { result: target } = await sendRaw('Target.createTarget', { url: 'about:blank' });
sessionId = (await sendRaw('Target.attachToTarget', { targetId: target.targetId, flatten: true })).result.sessionId;
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send('Page.navigate', { url });
await cdp.sleep(6000);

let nodeCount = 0;
for (let i = 0; i < 30; i++) {
  nodeCount = await cdp.evaluate(`document.querySelectorAll('.node').length`);
  if (nodeCount >= 4) break;
  await cdp.sleep(500);
}
if (nodeCount < 4) {
  console.error(`editor did not boot: ${nodeCount} nodes`);
  chrome.kill();
  process.exit(2);
}
console.log(`booted: ${nodeCount} nodes at ${url}`);
await cdp.shot('01-editor.png');

// ------------------------------------------------- 1. map header alignment --
// "Left-aligned" = title starts near the header's left edge and its centre
// is far from the header centre. A centered title has centre ~= centre.
{
  const m = await cdp.evaluate(`(() => {
    const header = document.querySelector('.map-input-header');
    if (!header || !header.matches('.map-input-header')) return { matches: false };
    const title = header.querySelector('.map-header-title');
    if (!title || !title.matches('.map-header-title')) return { matches: false, headerOnly: true };
    const h = header.getBoundingClientRect(), t = title.getBoundingClientRect();
    return { matches: true, label: title.textContent.trim(),
      header: { x: h.x, width: h.width }, title: { x: t.x, width: t.width },
      leftOffset: t.x - h.x,
      titleCenter: t.x + t.width / 2, headerCenter: h.x + h.width / 2,
      centerDelta: (t.x + t.width / 2) - (h.x + h.width / 2),
      textAlign: getComputedStyle(header).textAlign };
  })()`);
  if (!m.matches) {
    skip('map-header-left-aligned', 'selector .map-input-header/.map-header-title did not match; computed style cannot be trusted');
  } else if (m.leftOffset <= 40 && Math.abs(m.centerDelta) > 30) {
    pass('map-header-left-aligned', fmt(m));
  } else {
    fail('map-header-left-aligned', fmt(m));
  }
  await cdp.shot('02-map-header.png');
}

// ------------------------------------------- 8. socket anchor points ------
// Runs first, straight after boot: the spec says 'before any node has been
// moved', and earlier interactions (collapse toggles, canvas clicks) can
// shift the area, which would confound the anchor measurement.
// Probe before any node is moved: click an output socket, read the open
// connection's path start; then cancel, click an input socket, read the
// path end. The path is in viewport coordinates (svg spans the canvas).
async function socketCenter(testid) {
  return cdp.evaluate(`(() => {
    const s = document.querySelector('[data-testid="${testid}"] .socket-container') || document.querySelector('[data-testid="${testid}"]');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
}
async function openPath() {
  return cdp.evaluate(`(() => {
    const svg = document.querySelector('[data-testid="connection"]');
    if (!svg) return null;
    const p = svg.querySelector('path.path') || svg.querySelector('path');
    if (!p) return null;
    const d = p.getAttribute('d') || '';
    const nums = d.match(/-?\\d+\\.?\\d*/g) || [];
    if (nums.length < 4) return { d, start: null, end: null };
    const m = p.getScreenCTM && p.getScreenCTM();
    const screen = (x, y) => {
      if (m == null) return null;
      const pt = new DOMPoint(x, y).matrixTransform(m);
      return [pt.x, pt.y];
    };
    return { d, start: screen(+nums[0], +nums[1]), end: screen(+nums[nums.length - 2], +nums[nums.length - 1]) };
  })()`);
}
{
  const out = await socketCenter('output-socket');
  const inp = await socketCenter('input-socket');
  if (!out || !inp) {
    skip('socket-anchor-points', 'could not locate input/output sockets');
  } else {
    // click-from-output
    await cdp.move(out.x, out.y);
    await cdp.click(out.x, out.y);
    await cdp.sleep(300);
    await cdp.move(out.x + 180, out.y + 120);
    await cdp.sleep(300);
    const p1 = await openPath();
    await cdp.shot('04-socket-output.png');
    // cancel open connection: click empty canvas far from nodes
    await cdp.click(640, 820);
    await cdp.sleep(300);
    // click-from-input
    await cdp.move(inp.x, inp.y);
    await cdp.click(inp.x, inp.y);
    await cdp.sleep(300);
    await cdp.move(inp.x - 180, inp.y + 120);
    await cdp.sleep(300);
    const p2 = await openPath();
    await cdp.shot('05-socket-input.png');
    await cdp.click(640, 820); // cancel
    await cdp.sleep(300);

    const dist = (a, b) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : null;
    const dOut = p1 ? dist(p1.start, [out.x, out.y]) : null;
    const dIn = p2 ? dist(p2.end, [inp.x, inp.y]) : null;
    const detail = fmt({ output: { center: [Math.round(out.x), Math.round(out.y)], pathStart: p1?.start ?? null, dist: dOut == null ? null : +dOut.toFixed(1) },
                              input: { center: [Math.round(inp.x), Math.round(inp.y)], pathEnd: p2?.end ?? null, dist: dIn == null ? null : +dIn.toFixed(1) },
                              tolPx: 3 });
    if (dOut != null && dIn != null && dOut <= 3 && dIn <= 3) pass('socket-anchor-points', detail);
    else if (dOut == null || dIn == null) skip('socket-anchor-points', `open connection path not readable: ${detail}`);
    else fail('socket-anchor-points', detail);
  }
}

// Complete a real connection (output of node 1 -> input of node 2) so
// check 7 has a wire to probe. Uses the socket centers found above.
{
  const out = await socketCenter('output-socket');
  // second node's first input socket
  const inp2 = await cdp.evaluate(`(() => {
    const nodes = document.querySelectorAll('.node');
    const s = nodes[1]?.querySelector('[data-testid="input-socket"] .socket-container') || nodes[1]?.querySelector('[data-testid="input-socket"]');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (out && inp2) {
    await cdp.move(out.x, out.y); await cdp.click(out.x, out.y); await cdp.sleep(250);
    await cdp.move(inp2.x, inp2.y); await cdp.click(inp2.x, inp2.y); await cdp.sleep(400);
    const n = await cdp.evaluate(`document.querySelectorAll('[data-testid="connection"]').length`);
    console.log(`connection setup: ${n} connection(s)`);
    await cdp.shot('06-connection.png');
  }
}

// --------------------------------------------- 3. collapse keeps sockets --
// Count visible sockets before/after collapsing a node; the ports must
// stay in the DOM and connectable-looking (non-zero, visible boxes).
let collapseNode = null;
{
  const before = await cdp.evaluate(`(() => {
    const node = document.querySelector('.node');
    if (!node) return { matches: false };
    const sockets = [...node.querySelectorAll('[data-testid="input-socket"], [data-testid="output-socket"], [data-testid="collapsed-input-socket"], [data-testid="collapsed-output-socket"]')];
    const visible = sockets.filter(s => { const r = s.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(s).display !== 'none' && getComputedStyle(s).visibility !== 'hidden'; });
    const toggle = node.querySelector('.node-collapse-toggle');
    if (!toggle || !toggle.matches('.node-collapse-toggle')) return { matches: false, sockets: sockets.length };
    const r = toggle.getBoundingClientRect();
    return { matches: true, total: sockets.length, visible: visible.length, toggle: { x: r.x + r.width / 2, y: r.y + r.height / 2 } };
  })()`);
  if (!before.matches) {
    skip('collapse-keeps-sockets', 'collapse toggle or sockets did not match selectors');
  } else {
    await cdp.click(before.toggle.x, before.toggle.y);
    await cdp.sleep(500);
    const after = await cdp.evaluate(`(() => {
      const node = document.querySelector('.node');
      const sockets = [...node.querySelectorAll('[data-testid="input-socket"], [data-testid="output-socket"], [data-testid="collapsed-input-socket"], [data-testid="collapsed-output-socket"]')];
      const visible = sockets.filter(s => { const r = s.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(s).display !== 'none' && getComputedStyle(s).visibility !== 'hidden'; });
      return { total: sockets.length, visible: visible.length, strip: node.querySelectorAll('.collapsed-socket-strip').length, height: node.getBoundingClientRect().height };
    })()`);
    await cdp.shot('03-collapsed.png');
    const ok = after.total === before.total && after.visible === before.visible && after.visible > 0;
    (ok ? pass : fail)('collapse-keeps-sockets', fmt({ before: { total: before.total, visible: before.visible }, after }));
    // re-expand for later checks
    await cdp.click(before.toggle.x, before.toggle.y);
    await cdp.sleep(400);
    collapseNode = before;
  }
}

// ----------------------------------------- 2. empty Definition label ------
// The sample graph's Definitions are non-empty, so empty one through the
// editor model (paramInputs = [] + node.update()), verify the rendered
// empty state, then restore. If the model mutation does not re-render,
// this check is SKIPPED rather than guessed.
{
  const res = await cdp.evaluate(`(async () => {
    const ed = window.editor;
    if (!ed || typeof ed.getNodes !== 'function') return { ok: false, why: 'window.editor unavailable' };
    const node = ed.getNodes().find(n => n.inputs && n.inputs['definition']);
    if (!node) return { ok: false, why: 'no node with a definition input' };
    const def = node.inputs['definition'];
    window.__savedParamInputs = def.paramInputs;
    def.paramInputs = [];
    def.expanded = true;
    if (typeof node.update === 'function') await node.update();
    await new Promise(r => setTimeout(r, 600));
    const header = document.querySelector('.map-input-header');
    const paramsEl = header ? header.parentElement.querySelector('.map-parameters') : null;
    const labelText = paramsEl ? paramsEl.textContent.trim() : null;
    const children = paramsEl ? paramsEl.children.length : null;
    return { ok: true, children, labelText, labelLen: labelText ? labelText.length : 0 };
  })()`);
  // Screenshot in the emptied state (before restore), so the PNG is evidence
  // of the blank/labelled area rather than of the restored graph.
  await cdp.shot('07-empty-definition.png');
  await cdp.evaluate(`(async () => {
    const ed = window.editor;
    const node = ed.getNodes().find(n => n.inputs && n.inputs['definition']);
    if (node) {
      node.inputs['definition'].paramInputs = window.__savedParamInputs || [];
      if (typeof node.update === 'function') await node.update();
    }
    await new Promise(r => setTimeout(r, 400));
    return true;
  })()`);
  if (!res.ok) skip('empty-definition-label', res.why || 'model mutation unavailable');
  else if (res.children === 0 && res.labelLen > 0) pass('empty-definition-label', fmt(res));
  else {
    // The model mutation above is not reactive through the component's
    // computed cache. Use a real empty Definition instead: insert the
    // generic chamfer statement, whose definition map is intentionally empty.
    await cdp.keys('F3');
    await cdp.sleep(300);
    const typed = await cdp.evaluate(`(() => {
      const i = document.querySelector('.actions-search');
      if (!i) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(i, 'chamfer'); i.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await cdp.sleep(500);
    const item = await cdp.evaluate(`(() => { const b = document.querySelector('.actions-item'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (item) { await cdp.click(item.x, item.y); await cdp.sleep(900); }
    const empty = await cdp.evaluate(`(() => {
      const label = document.querySelector('.map-empty-state');
      const tag = document.querySelector('.map-header-empty');
      const n = [...document.querySelectorAll('.node')].find(e => e.querySelector('.map-empty-state'));
      return n ? { text: label?.textContent?.trim() ?? null, tag: tag?.textContent?.trim() ?? null, aria: label?.getAttribute('aria-label') ?? null } : null;
    })()`);
    await cdp.shot('07-empty-definition.png');
    if (typed && empty && empty.text && empty.text.length > 0) pass('empty-definition-label', fmt({ ...empty, source: 'generic chamfer node' }));
    else skip('empty-definition-label', `generic chamfer did not expose an empty Definition (${fmt({ typed, empty })})`);
  }
}

// --------------------------------------- 6. frame encloses selection ------
{
  // measure selected nodes (first two chamfer nodes; first has an expanded
  // Definition), select them with real clicks, then Ctrl+G.
  const before = await cdp.evaluate(`(() => {
    const nodes = [...document.querySelectorAll('.node')].filter(n => !n.querySelector('.frame-node'));
    // Single-node selection: shift/ctrl-click does not multi-select in this
    // build (probed: selection stays at 1), so frame the first node, which
    // carries an expanded Definition.
    const pick = nodes.slice(0, 1);
    const rects = pick.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; });
    const centers = pick.map(n => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const defHeight = pick[0] ? pick[0].getBoundingClientRect().height : null;
    const defExpanded = pick[0] ? pick[0].querySelector('.map-input-header')?.getAttribute('aria-expanded') : null;
    return { rects, centers, defHeight, defExpanded };
  })()`);
  if (!before.centers?.length) {
    skip('frame-encloses-selection', 'could not locate nodes to select');
  } else {
    await cdp.click(before.centers[0].x, before.centers[0].y);
    await cdp.sleep(300);
    const selected = await cdp.evaluate(`document.querySelectorAll('.node.selected').length`);
    // Ctrl+G
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'g', code: 'KeyG', modifiers: 2, text: 'g' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'g', code: 'KeyG', modifiers: 2 });
    await cdp.sleep(800);
    const frame = await cdp.evaluate(`(() => {
      const f = document.querySelector('.frame-node');
      if (!f || !f.matches('.frame-node')) return { matches: false };
      const r = f.getBoundingClientRect();
      return { matches: true, x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
    })()`);
    await cdp.shot('12-frame.png');
    if (!frame.matches) {
      skip('frame-encloses-selection', `Ctrl+G did not create a frame (selected=${selected}); shortcut may not dispatch headlessly`);
    } else {
      const union = {
        x: Math.min(...before.rects.map(r => r.x)), y: Math.min(...before.rects.map(r => r.y)),
        right: Math.max(...before.rects.map(r => r.right)), bottom: Math.max(...before.rects.map(r => r.bottom)),
      };
      const pad = { left: union.x - frame.x, top: union.y - frame.y, right: frame.right - union.right, bottom: frame.bottom - union.bottom };
      const encloses = frame.x <= union.x && frame.y <= union.y && frame.right >= union.right && frame.bottom >= union.bottom;
      const padded = Math.min(pad.left, pad.top, pad.right, pad.bottom) >= 8;
      const detail = fmt({ selected, union: { w: +(union.right - union.x).toFixed(0), h: +(union.bottom - union.y).toFixed(0) },
        frame: { w: +frame.w.toFixed(0), h: +frame.h.toFixed(0) }, padding: Object.fromEntries(Object.entries(pad).map(([k, v]) => [k, +v.toFixed(0)])),
        defExpanded: before.defExpanded, defHeight: before.defHeight == null ? null : +before.defHeight.toFixed(0) });
      if (encloses && padded) pass('frame-encloses-selection', detail);
      else fail('frame-encloses-selection', detail);
    }
  }
}

// ------------------------------------------- 7. frame below connection ----
{
  const res = await cdp.evaluate(`(() => {
    const frame = document.querySelector('.frame-node');
    const svg = document.querySelector('[data-testid="connection"]');
    if (!frame) return { ok: false, why: 'no frame on canvas' };
    if (!svg) return { ok: false, why: 'no connection on canvas' };
    const path = svg.querySelector('path.path') || svg.querySelector('path');
    if (!path || typeof path.getPointAtLength !== 'function') return { ok: false, why: 'connection path not measurable' };
    const len = path.getTotalLength();
    const hits = [];
    for (let i = 1; i <= 9; i++) {
      const pt = path.getPointAtLength((len * i) / 10);
      const el = document.elementFromPoint(pt.x, pt.y);
      if (el) hits.push({ x: Math.round(pt.x), y: Math.round(pt.y), top: (el.tagName || '') + '.' + (typeof el.className === 'string' ? el.className : (el.className.baseVal || '')), isFrame: el === frame || frame.contains(el) });
    }
    const frameEl = frame.closest('.node') || frame;
    const frameZ = Number.parseInt(getComputedStyle(frameEl).zIndex, 10);
    const svgZ = Number.parseInt(getComputedStyle(svg).zIndex, 10);
    const frameBeforeSvg = Boolean(frame.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING);
    // elementFromPoint cannot prove paint order for the wire: rete gives the
    // connection SVG pointer-events: none, so the frame still receives the
    // hit even when the wire paints above it. Use the actual stacking values.
    const stackedBelow = Number.isFinite(frameZ) && Number.isFinite(svgZ) && frameZ < svgZ;
    return { ok: true, samples: hits.length, frameHits: hits.filter(h => h.isFrame).length,
      hits: hits.slice(0, 4), frameZ, svgZ, frameBeforeSvg, stackedBelow };
  })()`);
  await cdp.shot('13-frame-connection.png');
  if (!res.ok) skip('frame-below-connection', res.why);
  else if (res.stackedBelow || res.frameHits === 0) pass('frame-below-connection', fmt(res));
  else fail('frame-below-connection', fmt(res));
}

// ------------------------------------------- 4. context menu click-open ---
{
  // right-click an empty canvas spot (below the nodes)
  const spot = await cdp.evaluate(`(() => {
    const holder = document.querySelector('.rete-area, [class*="area"]');
    return { x: 640, y: 700 };
  })()`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: spot.x, y: spot.y, button: 'right', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: spot.x, y: spot.y, button: 'right', clickCount: 1 });
  await cdp.sleep(600);
  const menu = await cdp.evaluate(`(() => {
    const m = document.querySelector('[data-testid="context-menu"]');
    return m ? { matches: m.matches('[data-testid="context-menu"]'), w: m.getBoundingClientRect().width } : null;
  })()`);
  if (!menu || !menu.matches) {
    skip('context-menu-click-open', 'context menu did not open on right-click');
  } else {
    const category = await cdp.evaluate(`(() => {
      const item = document.querySelector('[data-testid="context-menu"] .block.hasSubitems .content');
      if (!item) return null;
      const r = item.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: item.textContent.trim() };
    })()`);
    if (!category) {
      skip('context-menu-click-open', 'no category with subitems found in context menu');
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    } else {
      // hover only — must NOT open
      await cdp.move(category.x, category.y);
      await cdp.sleep(500);
      const onHover = await cdp.evaluate(`(() => {
        const subs = [...document.querySelectorAll('[data-testid="context-menu"] .subitems')];
        const vis = subs.filter(s => { const r = s.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(s).display !== 'none'; });
        return { visible: vis.length, labels: vis.map(s => s.textContent.trim().slice(0, 60)) };
      })()`);
      await cdp.shot('08-context-menu-hover.png');
      // click — must open
      await cdp.click(category.x, category.y);
      await cdp.sleep(500);
      const onClick = await cdp.evaluate(`(() => {
        const subs = [...document.querySelectorAll('[data-testid="context-menu"] .subitems')];
        const vis = subs.filter(s => { const r = s.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(s).display !== 'none'; });
        const target = vis[0] || null;
        return { visible: vis.length, children: target ? target.children.length : 0,
          scrollable: target ? (target.scrollHeight > target.clientHeight || ['auto','scroll'].includes(getComputedStyle(target).overflowY)) : false,
          scrollHeight: target ? target.scrollHeight : null, clientHeight: target ? target.clientHeight : null,
          overflowY: target ? getComputedStyle(target).overflowY : null };
      })()`);
      await cdp.shot('09-context-menu-click.png');
      const detail = fmt({ category: category.label, onHoverVisible: onHover.visible, onClick });
      if (onHover.visible === 0 && onClick.visible > 0 && onClick.children > 0) pass('context-menu-click-open', detail);
      else fail('context-menu-click-open', detail);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
      await cdp.sleep(300);
    }
  }
  // Reload to a clean sample graph: interacting with the menu can insert a
  // node (hover-open shifts items under the cursor), which would pollute
  // the palette / title-edit checks that follow.
  const nodeCountNow = await cdp.evaluate(`document.querySelectorAll('.node').length`);
  if (nodeCountNow !== nodeCount) {
    await cdp.send('Page.navigate', { url });
    await cdp.sleep(6000);
    for (let i = 0; i < 30; i++) {
      const n = await cdp.evaluate(`document.querySelectorAll('.node').length`);
      if (n >= 4) break;
      await cdp.sleep(500);
    }
    console.log(`reloaded clean graph after context-menu check (was ${nodeCountNow} nodes)`);
  }
}

// ------------------------------------------- 5. palette search features ---
{
  const opened = await cdp.evaluate(`!!document.querySelector('.actions')`);
  await cdp.keys('F3');
  await cdp.sleep(600);
  let paletteOpenVia = 'F3';
  let isOpen = await cdp.evaluate(`(()=>{const a=document.querySelector('.actions'); return a? a.matches('.actions') : false})()`);
  if (!isOpen) {
    // fallback: Shift+A
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'A', code: 'KeyA', modifiers: 8, text: 'A' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'A', code: 'KeyA', modifiers: 8 });
    await cdp.sleep(600);
    isOpen = await cdp.evaluate(`(()=>{const a=document.querySelector('.actions'); return a? a.matches('.actions') : false})()`);
    paletteOpenVia = isOpen ? 'Shift+A' : 'none';
  }
  if (!isOpen) {
    skip('palette-search-features', 'palette did not open via F3 or Shift+A');
  } else {
    async function search(q) {
      await cdp.evaluate(`(() => {
        const i = document.querySelector('.actions-search');
        if (!i) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(i, '');
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.focus();
      })()`);
      await cdp.send('Input.insertText', { text: q });
      await cdp.sleep(500);
      return cdp.evaluate(`({
        names: [...document.querySelectorAll('.actions-item-name')].map(e => e.textContent.trim()),
        nodeKind: document.querySelectorAll('.actions-item-meta').length,
        emptyText: document.querySelector('.actions-empty')?.textContent?.trim() || null,
        inputValue: document.querySelector('.actions-search')?.value || null,
      })`);
    }
    const chamferRes = await search('chamfer');
    const extrudeRes = await search('extrude');
    const chamfer = chamferRes.names, extrude = extrudeRes.names;
    await cdp.shot('10-palette-search.png');
    // Close via the backdrop (@click.self): Escape handling lives on the
    // search input and the palette must not leak into later checks.
    await cdp.click(80, 80);
    await cdp.sleep(400);
    const stillOpen = await cdp.evaluate(`!!document.querySelector('.actions')`);
    if (stillOpen) {
      await cdp.click(1200, 80);
      await cdp.sleep(400);
    }
    const hasChamfer = chamfer.some(l => /chamfer/i.test(l));
    const hasOther = extrude.some(l => /extrude|fillet|plane|shell|loft|sweep/i.test(l)) || chamfer.length >= 2;
    const detail = fmt({ via: paletteOpenVia, chamferResults: chamfer.slice(0, 8), extrudeResults: extrude.slice(0, 8),
      chamferNodeKind: chamferRes.nodeKind, extrudeNodeKind: extrudeRes.nodeKind,
      chamferEmptyText: chamferRes.emptyText, chamferInput: chamferRes.inputValue });
    if (hasChamfer && hasOther) pass('palette-search-features', detail);
    else fail('palette-search-features', detail);
  }
}

// ------------------------------------------------- 9. title edit outline --
{
  const title = await cdp.evaluate(`(() => {
    const t = document.querySelector('.node-title');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!title) {
    skip('title-edit-outline', '.node-title not found');
  } else {
    // Real double-click: two separate presses (a single press with
    // clickCount=2 does not synthesize a dblclick in headless Chrome).
    await cdp.click(title.x, title.y);
    await cdp.click(title.x, title.y, { count: 2 });
    await cdp.sleep(500);
    const titleState = await cdp.evaluate(`(() => {
      const i = document.querySelector('.node-title-editor');
      if (!i || !i.matches('.node-title-editor')) return { matches: false };
      const r = i.getBoundingClientRect();
      return { matches: true, visible: r.width > 0 && r.height > 0 && getComputedStyle(i).display !== 'none', focused: document.activeElement === i };
    })()`);
    let openedVia = 'double-click';
    if (!titleState.visible || !titleState.focused) {
      // single click on the title also starts the edit (onTitleClick)
      await cdp.click(title.x, title.y);
      await cdp.sleep(500);
      openedVia = 'single-click';
    }
    const opened = await cdp.evaluate(`(() => {
      const i = document.querySelector('.node-title-editor');
      if (!i || !i.matches('.node-title-editor')) return false;
      const r = i.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(i).display !== 'none' && document.activeElement === i;
    })()`);
    if (!opened) {
      // Coordinate clicks do not land on the small pencil button headlessly
      // (probed: JS dispatch works, CDP hit-testing does not), so invoke the
      // button's own click handler as the fallback opener.
      await cdp.evaluate(`document.querySelector('.node-title-edit-toggle')?.click()`);
      await cdp.sleep(500);
      openedVia = 'pencil-button-js-click';
    }
    const s = await cdp.evaluate(`(() => {
      const i = document.querySelector('.node-title-editor');
      if (!i || !i.matches('.node-title-editor')) return { matches: false };
      const r = i.getBoundingClientRect();
      const cs = getComputedStyle(i);
      return { matches: true, visible: r.width > 0 && r.height > 0 && cs.display !== 'none', outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth,
        outlineColor: cs.outlineColor, borderColor: cs.borderColor, boxShadow: cs.boxShadow,
        focused: document.activeElement === i };
    })()`);
    await cdp.shot('11-title-edit.png');
    await cdp.keys('Escape');
    await cdp.sleep(200);
    if (!s.matches) {
      skip('title-edit-outline', 'title editor input did not match .node-title-editor after double-click');
    } else if (!s.visible || !s.focused) {
      skip('title-edit-outline', `title editor never became visible+focused after double-click (visible=${s.visible}, focused=${s.focused}); outline cannot be measured reliably headlessly`);
    } else {
      // saturation of outline colour (HSL): saturated blue ~= hue 200-240, sat > 0.5
      const rgb = s.outlineColor.match(/\d+\.?\d*/g)?.map(Number) || [];
      let sat = null, hue = null;
      if (rgb.length >= 3) {
        const [r, g, b] = rgb.slice(0, 3).map(v => v / 255);
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        const d = max - min;
        sat = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);
        hue = d === 0 ? 0 : max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
      }
      // 'Saturated blue' = clearly saturated (sat > 0.65); the guide's steel-blue
      // accent #2f5f8f sits at sat ~0.51 and is the deliberate focus colour.
      const saturatedBlue = sat != null && sat > 0.65 && hue >= 190 && hue <= 250;
      const detail = fmt({ ...s, openedVia, saturation: sat == null ? null : +sat.toFixed(2), hue: hue == null ? null : Math.round(hue) });
      if (s.outlineStyle === 'none' || s.outlineWidth === '0px' || !saturatedBlue) pass('title-edit-outline', detail);
      else fail('title-edit-outline', detail);
    }
  }
}

// ----------------------------------------------------------------- finish --

const counts = { PASS: 0, FAIL: 0, SKIPPED: 0 };
for (const c of checks) counts[c.status] = (counts[c.status] || 0) + 1;
const report = { url, startedAt: new Date().toISOString(), counts, checks };
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n${counts.PASS} PASS / ${counts.FAIL} FAIL / ${counts.SKIPPED} SKIPPED — report: ${path.join(outDir, 'report.json')}`);

chrome.kill();
process.exit(counts.FAIL > 0 ? 1 : 0);
