#!/usr/bin/env node
// Defect checks for three user-reported issues (wave-qa-agent).
// Writes report.json + screenshots under tmp/qa-runs/defect-checks/ only
// (no HTML). Prints human-readable PASS/FAIL per check; exits 1 when a
// defect is found, unless —advisory is passed (then exit 0, CI stays green
// while the app fixes land, findings still recorded as issues).
//
// Usage: node qa/harness/defect-checks.mjs [--url <url>] [--out <dir>] [--advisory]
//   QA_URL env also honoured. Dev server must serve the worktree app.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : null; };
const advisory = argv.includes('--advisory');
const URL = arg('url') || process.env.QA_URL || 'http://127.0.0.1:5173/onshape-node-editor/';
const OUT = path.resolve(arg('out') || 'tmp/qa-runs/defect-checks');
mkdirSync(path.join(OUT, 'screenshots', 'actions'), { recursive: true });
mkdirSync(path.join(OUT, 'screenshots', 'issues'), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const actions = [], issues = [];
let actSeq = 0, issueSeq = 0;
const startedAt = Date.now();

function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  for (const p of ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome']) if (existsSync(p)) return p;
  return null;
}

let browser, page;
const rel = (p) => path.relative(OUT, p).split(path.sep).join('/');
async function shot(name) {
  const full = path.join(OUT, 'screenshots', 'actions', name);
  try { await page.screenshot({ path: full }); } catch (e) { console.warn(`screenshot failed: ${e.message}`); }
  return rel(full);
}
async function shotIssue(title) {
  const full = path.join(OUT, 'screenshots', 'issues', `${String(issues.length + 1).padStart(3, '0')}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.png`);
  try { await page.screenshot({ path: full }); } catch {}
  return rel(full);
}

// Record one timeline action (agent progress line) — mirrors explorer record().
async function record(name, area, fn) {
  const id = `act-${String(++actSeq).padStart(3, '0')}`;
  const t0 = Date.now();
  let status = 'passed', error = null;
  try { await fn(); } catch (e) { status = 'failed'; error = e.message.slice(0, 500); }
  const screenshot = await shot(`${String(actSeq).padStart(3, '0')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.png`);
  const rec = { id, name, area, status, durationMs: Date.now() - t0, changed: true, error, consoleErrors: [], screenshot };
  actions.push(rec);
  console.log(`[QA ${String(actSeq).padStart(3, '0')}] ${id} ${name} [${area}] ${status} ${rec.durationMs}ms${error ? ` — ${error}` : ''} shot=${screenshot}`);
  return rec;
}
async function addIssue({ title, severity = 'high', category, area, description, expected, actual, steps, suggestion, actionId }) {
  const id = `ui-${String(++issueSeq).padStart(3, '0')}`;
  const screenshot = await shotIssue(title);
  issues.push({ id, title, severity, category, area, description, expected, actual, steps, suggestion, screenshot, annotated: null, bbox: null, viewport: { width: 1440, height: 900 }, actionId: actionId || null, console: [] });
  console.log(`ISSUE ${id} [${severity}/${category}] ${title}`);
  return issues[issues.length - 1];
}

const MEASURE_CONNECTIONS = `(() => {
  let paths = [...document.querySelectorAll('[data-testid="connection"] path.path')];
  if (!paths.length) paths = [...document.querySelectorAll('.rete-connection path, path.connection, svg path')].filter((p) => p.getAttribute('d'));
  const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const outs = [...document.querySelectorAll('[data-testid="output-socket"], [data-testid="collapsed-output-socket"]')].map(center);
  const ins = [...document.querySelectorAll('[data-testid="input-socket"], [data-testid="collapsed-input-socket"]')].map(center);
  const toScreen = (p, x, y) => { const pt = new DOMPoint(x, y).matrixTransform(p.getScreenCTM?p.getScreenCTM():p.getCTM()); return { x: pt.x, y: pt.y }; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const nearest = (p, list) => list.length ? Math.min(...list.map((q) => dist(p, q))) : -1;
  return paths.map((p) => {
    const d = p.getAttribute('d') ?? '';
    const nums = [...d.matchAll(/-?\\d+\\.?\\d*/g)].map((m) => Number(m[0]));
    if (nums.length < 4) return { d: d.slice(0, 80), startErr: -1, endErr: -1 };
    const start = toScreen(p, nums[0], nums[1]);
    const end = toScreen(p, nums[nums.length - 2], nums[nums.length - 1]);
    return { d: d.slice(0, 80), sx: Math.round(start.x), sy: Math.round(start.y), ex: Math.round(end.x), ey: Math.round(end.y), startErr: Math.round(nearest(start, outs) * 10) / 10, endErr: Math.round(nearest(end, ins) * 10) / 10 };
  });
})()`;

async function tryWire(out, inp) {
  const before = await page.$$eval('[data-testid="connection"]', (els) => els.length).catch(() => 0);
  await page.mouse.move(out.x, out.y);
  await page.mouse.down();
  await page.mouse.move((out.x + inp.x) / 2, out.y, { steps: 8 });
  await page.waitForTimeout(250);
  await page.mouse.move(inp.x, inp.y, { steps: 30 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.$$eval('[data-testid="connection"]', (els) => els.length).catch(() => 0);
  return after > before;
}

async function checkGroupWires() {
  return record('Group: wire, create group, Tab in/out, measure restored wires', 'group', async () => {
    // Generic wiring: try compatible pairs until we have >=1 wire involving
    // the first two nodes (the group candidates). External = one end in the
    // two grouped nodes, one end outside.
    const pairs = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('.node')];
      const inGroupId = new Set(nodes.slice(0, 2).map((n) => n.dataset?.id || n.querySelector('.node-title')?.textContent?.trim() || ''));
      const info = (sel) => [...document.querySelectorAll(sel)]
        .map((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, node: el.closest('.node')?.dataset?.id || el.closest('.node')?.querySelector('.node-title')?.textContent?.trim() || '', inGroup: false }; })
        .filter((p) => p.w > 0 && p.x >= 0 && p.y >= 0);
      const outs = info('[data-testid="output-socket"]');
      const ins = info('[data-testid="input-socket"]');
      // mark group membership by node index
      const idxOf = (nodeName) => nodes.findIndex((n) => (n.querySelector('.node-title')?.textContent?.trim() || '') === nodeName);
      for (const p of [...outs, ...ins]) p.inGroup = idxOf(p.node) >= 0 && idxOf(p.node) < 2;
      const pairs = [];
      for (const o of outs.slice(0, 8)) for (const i of ins.slice(0, 10)) {
        if (o.node === i.node) continue;
        const external = o.inGroup !== i.inGroup;
        pairs.push({ out: { x: o.x, y: o.y }, inp: { x: i.x, y: i.y }, external });
        if (pairs.length >= 12) break;
      }
      return { pairs: pairs.sort((a, b) => Number(b.external) - Number(a.external)), nodeCount: nodes.length };
    });
    if (!pairs.pairs?.length || (pairs.nodeCount ?? 0) < 2) throw new Error(`fewer than 2 nodes/sockets to wire (nodes=${pairs.nodeCount})`);
    let wired = 0;
    for (const pr of pairs.pairs) {
      if (wired >= 2) break;
      if (await tryWire(pr.out, pr.inp)) wired++;
    }
    if (wired === 0) throw new Error('could not create any wire by dragging sockets — wiring itself is broken');
    const before = await page.evaluate(MEASURE_CONNECTIONS);
    const beforeShot = await shot('group-before-group.png');
    console.log(`group check: wired=${wired} connectionsBefore=${before.length} shot=${beforeShot}`);

    // Create group from the two Chamfer nodes via the TopBar button (no
    // Control+g shortcut exists in this app), enter via Tab, exit via Tab.
    // Sample graph starts with two "Chamfer" nodes — select those two.
    const chamferNodes = await page.$$eval('.node', (els) => els.map((el, i) => ({ i, title: (el.querySelector('.node-title')?.textContent || '').trim() })));
    const chamferIdx = chamferNodes.filter((n) => /chamfer/i.test(n.title)).slice(0, 2).map((n) => n.i);
    const pick = chamferIdx.length >= 2 ? chamferIdx : [0, 1];
    console.log(`group check: chamfer node titles=${JSON.stringify(chamferNodes)} pick=${JSON.stringify(pick)}`);
    const nodes = await page.$$('.node');
    await nodes[pick[0]].click({ timeout: 3000 }); await sleep(200);
    await page.keyboard.down('Shift'); await nodes[pick[1]].click({ timeout: 3000 }); await page.keyboard.up('Shift');
    await sleep(300);
    await page.click('button[aria-label="Create group from selection"]', { timeout: 5000 }); await sleep(1000);
    const groupNodes = await page.$$eval('.node', (els) => els.length).catch(() => 0);
    const afterCreate = await page.evaluate(MEASURE_CONNECTIONS);
    const afterCreateMax = Math.max(0, ...afterCreate.map((c) => Math.max(c.startErr || 0, c.endErr || 0)));
    console.log(`group check: immediately after create offsets px=` + JSON.stringify(afterCreate.map((c) => ({ start: c.startErr, end: c.endErr }))) + ` max=${afterCreateMax}px`);
    const editorState = await page.evaluate(() => { const e = window.editor; return e ? { nodes: typeof e.getNodes === 'function' ? e.getNodes().map((n) => ({ id: n.id, label: n.label ?? n.data?.label ?? '' })) : 'no getNodes', conns: typeof e.getConnections === 'function' ? e.getConnections().length : 'no getConnections' } : 'no window.editor'; }).catch(() => 'editor probe failed');
    console.log(`group check: after TopBar Create group nodes=${groupNodes} (was ${pairs.nodeCount}) editor=${JSON.stringify(editorState).slice(0, 300)}`);
    // Select the created group instance (the node whose title is not Chamfer/Feature Type Name
    // is the group; fall back to the first node) and enter via Tab.
    const afterGroupNodes = await page.$$eval('.node', (els) => els.map((el, i) => ({ i, title: (el.querySelector('.node-title')?.textContent || '').trim() })));
    const groupIdx = (afterGroupNodes.find((n) => /group/i.test(n.title))?.i ?? afterGroupNodes.find((n) => !/chamfer|feature type|output/i.test(n.title))?.i) ?? 0;
    console.log(`group check: nodes after grouping=${JSON.stringify(afterGroupNodes)} groupIdx=${groupIdx}`);
    const firstNode = (await page.$$('.node'))[groupIdx ?? 0];
    if (firstNode) await firstNode.click({ timeout: 3000 }).catch(() => {});
    await sleep(200);
    await page.keyboard.press('Tab'); await sleep(1000);
    let insideTitles = await page.$$eval('.node', (els) => els.map((el) => (el.querySelector('.node-title')?.textContent || '').trim())).catch(() => []);
    console.log(`group check: after first Tab titles=${JSON.stringify(insideTitles)}`);
    if (!insideTitles.some((t) => /chamfer/i.test(t))) {
      // Re-select the group instance (selection may have been lost) and retry Tab.
      console.log('group check: Tab did not enter group, re-selecting and retrying');
      const retryNodes = await page.$$('.node');
      if (retryNodes[groupIdx ?? 0]) await retryNodes[groupIdx ?? 0].click({ timeout: 3000 }).catch(() => {});
      await page.keyboard.press('Tab'); await sleep(1000);
      insideTitles = await page.$$eval('.node', (els) => els.map((el) => (el.querySelector('.node-title')?.textContent || '').trim())).catch(() => []);
      console.log(`group check: after retry Tab titles=${JSON.stringify(insideTitles)}`);
    }
    const insideShot = await shot('group-inside.png');
    const insideCount = insideTitles.length;
    const afterEnter = await page.evaluate(MEASURE_CONNECTIONS);
    const afterEnterMax = Math.max(0, ...afterEnter.map((c) => Math.max(c.startErr || 0, c.endErr || 0)));
    console.log(`group check: inside group after enter offsets px=` + JSON.stringify(afterEnter.map((c) => ({ start: c.startErr, end: c.endErr }))) + ` max=${afterEnterMax}px`);
    console.log(`group check: inside group nodes=${insideCount} shot=${insideShot}`);
    await page.keyboard.press('Tab'); await sleep(1000);
    const afterShot = await shot('group-after-exit.png');
    const after = await page.evaluate(MEASURE_CONNECTIONS);
    console.log(`group check: after exit connections=${after.length} shot=${afterShot}`);
    console.log('group check: endpoint offsets px=' + JSON.stringify(after.map((c) => ({ start: c.startErr, end: c.endErr }))));
    const maxErr = Math.max(0, ...after.map((c) => Math.max(c.startErr || 0, c.endErr || 0)));
    console.log(`group check: max endpoint offset = ${maxErr}px (threshold 5px)`);
    const overallMax = Math.max(afterCreateMax, afterEnterMax, maxErr);
    if (overallMax > 5) {
      const worst = after.map((c, i) => ({ i, e: Math.max(c.startErr || 0, c.endErr || 0) })).sort((a, b) => b.e - a.e)[0] ?? { i: 0, e: overallMax };
      await addIssue({
        title: 'Restored wires offset after exiting node group', severity: 'high', category: 'visual', area: 'group',
        description: `After creating a group from the selection and entering/exiting it with Tab, restored connection endpoints do not meet their sockets. Max endpoint offset after-exit ${maxErr}px, after-create ${afterCreateMax}px, after-enter ${afterEnterMax}px (worst wire #${worst.i + 1}). Orchestrator probe on master a4e5d62 saw ~47-48px downward offset on the two restored external wires while the group instance wires were correct. Evidence: before=${beforeShot}, inside=${insideShot}, after=${afterShot}.`,
        expected: 'Every connection endpoint sits on its live socket centre (offset <= 5px) after exiting a group.',
        actual: `Max endpoint offset ${maxErr}px via getScreenCTM path endpoints vs socket centres. Per-wire: ${JSON.stringify(after.map((c) => ({ s: c.startErr, e: c.endErr })))}`,
        steps: ['Boot the sample graph (two Chamfer nodes)', 'Drag to wire an external input/output around the two nodes', 'Select both Chamfer nodes, click TopBar "Create group from selection"', 'Select the group instance, press Tab to enter', 'Press Tab to exit', 'Measure every restored path endpoint against live socket centres'],
        suggestion: 'On group restore, rebuild external connections from the snapshot after positions settle — the snapshot restore currently paints paths before sockets are laid out, leaving them offset by ~47px.',
        actionId: null,
      });
      console.log(`FAIL group wires: max offset ${maxErr}px > 5px — see ISSUE above (${issues[issues.length - 1].id})`);
    } else {
      console.log(`PASS group wires: max offset ${maxErr}px <= 5px`);
    }
    return `max offset ${maxErr}px over ${after.length} wires`;
  });
}

async function openPalette(kind) {
  // kind: 'nodes' (Shift+A) or 'actions' (F3)
  await page.mouse.click(720, 860).catch(() => {}); // neutral canvas click = last-pointer position
  await sleep(200);
  await page.keyboard.press(kind === 'nodes' ? 'Shift+A' : 'F3');
  await sleep(500);
  const sel = kind === 'nodes' ? '.palette-search' : '.actions-search';
  await page.waitForSelector(kind === 'nodes' ? '.palette' : '.actions', { timeout: 5000 }).catch(() => { throw new Error(`${kind} palette did not open`); });
  return sel;
}
async function closePalette() {
  await page.keyboard.press('Escape'); await sleep(400);
}

async function measurePaletteItems(kind) {
  // Returns per-item measurements: name, meta, gap, fontSize, color, contrast.
  return page.evaluate((k) => {
    const itemSel = k === 'nodes' ? '.palette-item' : '.actions-item';
    const nameSel = k === 'nodes' ? '.palette-item-name' : '.actions-item-name';
    const metaSel = k === 'nodes' ? '.palette-item-meta' : '.actions-item-desc';
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const items = [...document.querySelectorAll(itemSel)].slice(0, 8);
    return items.map((item, i) => {
      const nameEl = item.querySelector(nameSel);
      const metaEl = item.querySelector(metaSel);
      if (!nameEl || !metaEl) return { i, skip: true };
      const nr = nameEl.getBoundingClientRect(), mr = metaEl.getBoundingClientRect();
      const cs = getComputedStyle(metaEl);
      const fg = parse(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
      const opacity = parseFloat(cs.opacity) || 1;
      let bg = null, node = item;
      while (node) { const cb = parse(getComputedStyle(node).backgroundColor); if (cb && cb.a > 0.95) { bg = cb; break; } node = node.parentElement; }
      if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
      // Effective foreground = fg blended over bg at element opacity.
      const eff = { r: fg.r * opacity + bg.r * (1 - opacity), g: fg.g * opacity + bg.g * (1 - opacity), b: fg.b * opacity + bg.b * (1 - opacity) };
      const L1 = lum(eff), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      return {
        i, name: (nameEl.textContent || '').trim(), meta: (metaEl.textContent || '').trim(),
        gap: Math.round((mr.left - nr.right) * 10) / 10,
        metaLeft: Math.round(mr.left), nameRight: Math.round(nr.right),
        fontSize: parseFloat(cs.fontSize) || 0, opacity,
        color: cs.color, ratio: Math.round(ratio * 100) / 100,
        metaWidth: Math.round(mr.width), metaHeight: Math.round(mr.height),
      };
    });
  }, kind);
}

async function checkPaletteDescriptorsAndCase() {
  return record('Palette: chamfer/fillet descriptor contrast, adjacency and capitalization', 'palette', async () => {
    const failures = [];
    const details = [];
    for (const kind of ['nodes', 'actions']) {
      const searchSel = await openPalette(kind);
      for (const q of ['chamfer', 'fillet']) {
        await page.fill(searchSel, q, { timeout: 3000 }); await sleep(500);
        const shotName = `${kind}-palette-${q}.png`;
        const s = await shot(shotName);
        const items = await measurePaletteItems(kind);
        console.log(`palette ${kind} q="${q}": ${items.length} item(s) shot=${s}`);
        details.push(`${kind}/${q}: ${items.map((x) => x.skip ? '' : `"${x.name}" meta="${x.meta}" gap=${x.gap}px ratio=${x.ratio} op=${x.opacity}`).filter(Boolean).join(' | ') || 'no items'}`);
        // (2) Descriptor contrast + adjacency + readability.
        for (const it of items.filter((x) => !x.skip && x.meta)) {
          if (it.ratio < 4.5) failures.push(`descriptor contrast ${it.ratio}:1 < 4.5:1 for "${it.name}" (palette ${kind}, query "${q}")`);
          if (it.gap > 24) failures.push(`descriptor ${Math.round(it.gap)}px right of name "${it.name}" (palette ${kind}, query "${q}") — expected <= 24px adjacent, not far-right`);
          if (it.fontSize < 10 || it.metaWidth === 0 || !it.meta) failures.push(`descriptor unreadable/empty for "${it.name}" (palette ${kind}, query "${q}": fontSize=${it.fontSize}px width=${it.metaWidth})`);
        }
        // (3) Displayed name capitalized; lowercase query still returns a result.
        const nm = items.filter((x) => !x.skip && new RegExp(q, 'i').test(x.name));
        if (nm.length === 0) failures.push(`lowercase query "${q}" matched no "${q}" item (palette ${kind}) — search must stay case-insensitive`);
        for (const it of nm) if (!/^[A-Z]/.test(it.name)) failures.push(`standard-library name "${it.name}" displayed lowercase (palette ${kind}, query "${q}") — expected capitalized (e.g. "Chamfer")`);
      }
      await closePalette();
    }
    if (failures.length) {
      await addIssue({
        title: 'Palette descriptors faint/far from names; Standard Library names lowercase', severity: 'high', category: 'accessibility', area: 'palette',
        description: 'Searching "chamfer"/"fillet" in the palettes: descriptors sit far right of names with faint opacity, and names render lowercase. Reference probe on master a4e5d62: gap 170-331px, opacity 0.4, names lowercase. Evidence shots: nodes-palette-chamfer.png, nodes-palette-fillet.png, actions-palette-chamfer.png, actions-palette-fillet.png.',
        expected: 'Descriptor computed contrast >= 4.5:1, gap <= ~24px from the name (adjacent, not far-right), descriptor readable; displayed Standard Library names capitalized while lowercase queries still match.',
        actual: `${failures.length} failure(s): ${failures.slice(0, 8).join(' | ')}${failures.length > 8 ? ' | …' : ''}`,
        steps: ['Open Shift+A (Add node) palette', 'Search "chamfer" lowercase', 'Note the match and its descriptor position/contrast/case', 'Repeat for "fillet" and F3 action palette'],
        suggestion: 'Keep search case-insensitive but store/display capitalized Standard Library names; place the descriptor adjacent to the name (gap <= 24px) and raise its effective contrast to >= 4.5:1 (drop the 0.4 faint opacity on meta text).',
        actionId: null,
      });
      console.log(`FAIL palette: ${failures.length} failure(s) — ${failures.slice(0, 5).join(' | ')}`);
      throw new Error(`${failures.length} palette failure(s): ${failures.slice(0, 3).join('; ')}`);
    }
    console.log('PASS palette: contrast/adjacency/capitalization all hold');
    console.log('palette details: ' + details.join(' || '));
    return 'contrast >= 4.5, gap <= 24px, names capitalized';
  });
}

async function main() {
  const exec = findChrome();
  if (!exec) { console.error('FAIL no Chrome binary; set CHROME_BIN'); process.exit(2); }
  console.log(`defect-checks: browser=${exec} url=${URL} out=${OUT} advisory=${advisory}`);
  browser = await chromium.launch({ executablePath: exec, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.node', { timeout: 20000 }).catch(() => {});
  await sleep(1200);
  const nodeCount = await page.$$eval('.node', (els) => els.length).catch(() => 0);
  console.log(`boot: ${nodeCount} nodes`);
  await checkGroupWires();
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); // group mutations clean before palette checks
  await page.waitForSelector('.node', { timeout: 20000 }).catch(() => {});
  await sleep(1000);
  await checkPaletteDescriptorsAndCase();

  const report = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), url: URL, durationMs: Date.now() - startedAt,
    task: null,
    summary: { actions: actions.length, issues: issues.length, critical: 0, high: issues.filter((i) => i.severity === 'high').length, medium: issues.filter((i) => i.severity === 'medium').length, low: issues.filter((i) => i.severity === 'low').length },
    actions, issues,
  };
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`wrote ${path.join(OUT, 'report.json')} actions=${actions.length} issues=${issues.length}`);
  console.log(`summary: ${issues.length ? `FAIL — ${issues.map((i) => i.id + ': ' + i.title).join(' | ')}` : 'PASS — no defects found'}`);
  await browser.close().catch(() => {});
  const fatal = issues.length > 0;
  if (advisory && fatal) console.warn('advisory: findings recorded; not failing this run');
  process.exit(advisory ? 0 : fatal ? 1 : 0);
}
main().catch(async (e) => {
  console.error(`fatal: ${e.message}`);
  try { if (browser) await browser.close(); } catch {}
  process.exit(2);
});
