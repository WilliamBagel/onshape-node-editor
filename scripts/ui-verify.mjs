#!/usr/bin/env node
/**
 * Headless UI verification for the node editor.
 *
 * Drives a real Chrome over the DevTools Protocol, exercises the parts of the
 * UI that unit tests cannot see (map dropdowns, context menu, action palette,
 * contrast of rendered colors), asserts computed layout/style values, and
 * writes screenshots plus report.json. Subagents and humans can then look at
 * the PNGs to judge whether the result actually looks right.
 *
 * Usage (dev server already running):
 *   node scripts/ui-verify.mjs
 *   node scripts/ui-verify.mjs --url http://localhost:5173/onshape-node-editor/ --out tmp/ui-verify
 *
 * Requires Chrome/Chromium on PATH (google-chrome-stable or chromium).
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : fallback;
};
const url = arg('--url', 'http://localhost:5173/onshape-node-editor/');
const outDir = path.resolve(arg('--out', `tmp/ui-verify-${Date.now()}`));
const chromeBin = arg('--chrome', process.env.CHROME_BIN ?? findChrome());
const port = 9200 + Math.floor(Math.random() * 500);

function findChrome() {
  for (const p of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(p)) return p;
  }
  return 'google-chrome-stable';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const shots = [];

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 15000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', (e) => { clearTimeout(timer); reject(e); }, { once: true });
  });
  const cdp = new Cdp(ws);
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('PAGE EXCEPTION', msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      console.error('PAGE CONSOLE ERROR', msg.params.args?.map((a) => a.value ?? a.description).join(' '));
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return cdp;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(cdp, expression, timeout = 12000, label = expression) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(cdp, expression)) return;
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function screenshot(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, name);
  await writeFile(file, Buffer.from(data, 'base64'));
  shots.push(file);
  console.log(`SHOT  ${file}`);
  return file;
}

function addEvents(cdp) {
  cdp.ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Page.javascriptDialogOpening') {
      cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  });
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  if (!chromeBin || !existsSync(chromeBin)) throw new Error(`Chrome not found (${chromeBin})`);
  const profile = path.join(tmpdir(), `ui-verify-profile-${process.pid}`);
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--window-size=1440,900',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', () => {});

  try {
    let version;
    for (let i = 0; i < 100; i++) {
      try {
        version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
        break;
      } catch {
        await sleep(100);
      }
    }
    if (!version) throw new Error('Chrome DevTools endpoint did not start');

    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((r) => r.json());
    const cdp = await connect(target.webSocketDebuggerUrl);
    addEvents(cdp);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url });
    try {
      await waitFor(cdp, `document.querySelectorAll('.ns-dialog-frame').length > 0`, 20000, 'editor nodes');
    } catch (err) {
      await screenshot(cdp, '00-boot-failure.png');
      console.error(await evaluate(cdp, `JSON.stringify({ title: document.title, url: location.href, text: (document.body.innerText || '').slice(0, 200), html: document.body.innerHTML.slice(0, 500), app: !!document.querySelector('#app'), scripts: [...document.scripts].map(s => s.src).slice(-3) })`));
      throw err;
    }
    await sleep(500);
    await screenshot(cdp, '01-editor.png');

    // --- Map dropdown: collapse and re-open, and check layout actually moves.
    const mapInfo = await evaluate(cdp, `(() => {
      const m = document.querySelector('.map-input-container');
      if (!m) return null;
      const frame = m.closest('.ns-dialog-frame');
      return {
        label: m.querySelector('.map-header-title')?.textContent?.trim(),
        expanded: m.querySelector('.map-parameters') != null,
        params: m.querySelectorAll('.map-parameters .os-param-label').length,
        height: frame?.getBoundingClientRect().height ?? 0,
      };
    })()`);
    check('feature map exists and starts expanded with parameters', mapInfo && mapInfo.expanded && mapInfo.params > 0, JSON.stringify(mapInfo));

    await evaluate(cdp, `document.querySelector('.map-input-header').click()`);
    await sleep(300);
    const collapsed = await evaluate(cdp, `(() => {
      const m = document.querySelector('.map-input-container');
      const frame = m.closest('.ns-dialog-frame');
      return { expanded: m.querySelector('.map-parameters') != null, height: frame?.getBoundingClientRect().height ?? 0 };
    })()`);
    check('map collapses and the node shrinks', collapsed.expanded === false && collapsed.height < mapInfo.height, JSON.stringify(collapsed));
    await screenshot(cdp, '02-map-collapsed.png');

    await evaluate(cdp, `document.querySelector('.map-input-header').click()`);
    await sleep(300);
    const reopened = await evaluate(cdp, `(() => {
      const m = document.querySelector('.map-input-container');
      const frame = m.closest('.ns-dialog-frame');
      return { expanded: m.querySelector('.map-parameters') != null, height: frame?.getBoundingClientRect().height ?? 0 };
    })()`);
    check('map re-opens on the next click', reopened.expanded === true && reopened.height > collapsed.height, JSON.stringify(reopened));
    await screenshot(cdp, '03-map-expanded.png');

    // --- Context menu: open on the canvas, assert themed width/padding and no "►" glyph.
    await evaluate(cdp, `(() => {
      const bg = document.querySelector('.background');
      const r = bg.getBoundingClientRect();
      bg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: r.left + 240, clientY: r.top + 260 }));
      return true;
    })()`);
    await waitFor(cdp, `document.querySelector('.menu[rete-context-menu]') != null`, 5000, 'context menu');
    await sleep(250);
    const menu = await evaluate(cdp, `(() => {
      const el = document.querySelector('.menu[rete-context-menu]');
      const cs = getComputedStyle(el);
      const arrow = getComputedStyle(el.querySelector('.hasSubitems') ?? el, '::after').content;
      const block = el.querySelector('.block');
      return { width: cs.width, padding: cs.padding, bg: cs.backgroundColor, color: cs.color, arrow, blockOverflow: block ? getComputedStyle(block).overflowWrap : null };
    })()`);
    check('context menu uses the 260px themed surface', parseFloat(menu.width) >= 240 && menu.padding === '4px' && menu.bg === 'rgb(255, 255, 255)', JSON.stringify(menu));
    check('context menu has no "►" bracket glyph', menu.arrow !== '"►"', `::after content ${menu.arrow}`);
    await screenshot(cdp, '04-context-menu.png');
    // Click empty canvas to dismiss the menu, then let the app settle.
    await evaluate(cdp, `(() => { const bg = document.querySelector('.background'); const r = bg.getBoundingClientRect(); bg.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 240, clientY: r.top + 260 })); bg.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.left + 240, clientY: r.top + 260 })); return true; })()`);
    await sleep(300);

    // --- Action palette: search must find nodes as well as commands.
    await evaluate(cdp, `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', code: 'F3', bubbles: true })); return true; })()`);
    await waitFor(cdp, `document.querySelector('.actions-backdrop .actions-search') != null`, 5000, 'action palette').catch(() => {});
    const paletteOpened = await evaluate(cdp, `!!document.querySelector('.actions-backdrop')`);
    check('action palette opens on F3', paletteOpened);
    const input = await evaluate(cdp, `(() => { const el = document.querySelector('.actions-search'); if (!el) return null; el.focus(); el.value = 'fillet'; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(350);
    const palette = await evaluate(cdp, `(() => ({
      items: [...document.querySelectorAll('.actions-item')].map((e) => e.textContent.trim()).slice(0, 8),
      hasNode: [...document.querySelectorAll('.actions-item')].some((e) => e.querySelector('.actions-item-meta')),
    }))()`);
    check('palette search returns a node result for "fillet"', input && palette.hasNode && palette.items.some((t) => /fillet/i.test(t)), JSON.stringify(palette.items));
    await screenshot(cdp, '05-action-search.png');
    await evaluate(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);

    // --- Keycap contrast: WCAG contrast of rendered colors, not source tokens.
    const keycap = await evaluate(cdp, `(() => {
      const el = document.querySelector('.btn-keycap');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { color: cs.color, background: cs.backgroundColor, opacity: cs.opacity };
    })()`);
    const contrast = keycap ? contrastRatio(keycap.color, keycap.background) : 0;
    check('keycap text is readable on its background', contrast >= 4.5, `${keycap?.color} on ${keycap?.background}, ratio ${contrast.toFixed(2)}`);

    // --- Collapse chevron: a real 12px stroked path, not the tiny 5x3 symbol.
    const chevron = await evaluate(cdp, `(() => {
      const el = document.querySelector('.node-collapse-icon');
      if (!el) return null;
      return { tag: el.tagName, width: el.getBoundingClientRect().width, path: el.querySelector('path')?.getAttribute('d') ?? null, stroke: el.querySelector('path')?.getAttribute('stroke') };
    })()`);
    check('collapse icon is a 12px stroked chevron', chevron && Math.round(chevron.width) === 12 && chevron.path && chevron.stroke === 'currentColor', JSON.stringify(chevron));

    const report = {
      url,
      startedAt: new Date().toISOString(),
      passed: results.every((r) => r.ok),
      results,
      screenshots: shots,
    };
    await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n${report.passed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} — ${outDir}`);
    if (!report.passed) process.exitCode = 1;
  } finally {
    try { chrome.kill('SIGKILL'); } catch {}
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

function parseColor(value) {
  const m = /rgba?\(([^)]+)\)/.exec(value ?? '');
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(',').map((n) => parseFloat(n));
  return { r, g, b, a: a ?? 1 };
}

function contrastRatio(fg, bg) {
  const lum = (c) => {
    const channel = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  };
  const f = parseColor(fg);
  const b = parseColor(bg);
  if (!f || !b) return 0;
  const l1 = lum(f);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

main().catch((err) => {
  console.error(`ui-verify failed: ${err.stack ?? err}`);
  process.exitCode = 1;
});
