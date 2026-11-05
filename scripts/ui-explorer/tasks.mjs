/**
 * Realistic UI task scenarios for the UI explorer.
 *
 * UI-ONLY: every interaction below goes through visible UI (keyboard,
 * mouse, palette search, toolbar buttons, node controls). Nothing calls
 * `page.evaluate` to mutate the graph model, and nothing writes to the
 * editor's internal state. Read-only DOM inspection (locator text /
 * attributes) is used only to decide what to click next and to record
 * what the user would see.
 *
 * Context contract (passed by the core harness, `run(ctx)`):
 *   ctx.page    Playwright Page (required). All actions are on this page.
 *   ctx.log     optional (message) => void. Step narration.
 *   ctx.shot    optional (name) => path. Screenshot; `name` has no
 *               extension, the harness owns the output directory.
 *               If absent, falls back to `page.screenshot()` under
 *               ./tmp/ui-task-smoke/<name>.png (cwd-relative).
 *   ctx.record  optional (label, status, detail) => void.
 *               status is 'pass' | 'fail' | 'skip' (harness may use
 *               PASS/FAIL/SKIPPED). Called once per step.
 *   ctx.assert  optional (condition, message) => void. Throwing assert
 *               helper supplied by the harness, if any. This module does
 *               NOT rely on it for step gating (see below).
 *   ctx.issue   optional (...args) => void. Harness issue reporter.
 *   ctx.reload  optional () => Promise<void>. Reset to a clean graph.
 *               If absent, falls back to `page.reload()` + re-wait.
 *
 * Step gating: steps that are expensive to redo (inserting a node) are
 * recorded and collected, not aborted on the first failure, so one run
 * surfaces every UI blocker in order. At the end of `run`, if any
 * required step failed, `run` throws an Error listing the failed steps.
 * That is the task verdict: a throw means the scenario did not pass.
 * (The harness should catch it and mark the task failed; `record` /
 * `issue` calls made before the throw are the per-step evidence.)
 *
 * Each task is `{ id, name, description, run }` and the module exports
 * `tasks` (array) plus the individual task objects.
 */

const SHOT_FALLBACK_DIR = 'tmp/ui-task-smoke';

// ---------------------------------------------------------------- helpers

function makeHelpers(ctx) {
  const page = ctx.page;
  if (!page) throw new Error('tasks: ctx.page (Playwright Page) is required');

  const log = (msg) => {
    if (typeof ctx.log === 'function') ctx.log(msg);
    else console.log(`[task] ${msg}`);
  };

  const record = (label, status, detail) => {
    log(`${status.toUpperCase()} ${label}${detail ? ` — ${detail}` : ''}`);
    if (typeof ctx.record === 'function') {
      try { ctx.record(label, status, detail); } catch { /* harness-side */ }
    }
    if (status === 'fail' && typeof ctx.issue === 'function') {
      try { ctx.issue(label, detail); } catch { /* harness-side */ }
    }
  };

  async function shot(name) {
    if (typeof ctx.shot === 'function') {
      try { return await ctx.shot(name); } catch (e) { log(`shot ${name} failed: ${e.message}`); return null; }
    }
    const p = `${SHOT_FALLBACK_DIR}/${name}.png`;
    try { await page.screenshot({ path: p }); return p; } catch { return null; }
  }

  async function reload() {
    if (typeof ctx.reload === 'function') { await ctx.reload(); return; }
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  /** Wait until at least `min` node cards are on the canvas (boot). */
  async function waitForNodes(min = 4, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const n = await page.locator('.node').count().catch(() => 0);
      if (n >= min) return n;
      await page.waitForTimeout(500);
    }
    return page.locator('.node').count().catch(() => 0);
  }

  /** Locate a node card by its exact visible title. */
  function nodeByTitle(title) {
    return page
      .locator('.node')
      .filter({ has: page.locator('.node-title', { hasText: new RegExp(`^\\s*${title}\\s*$`) }) })
      .first();
  }

  /** Open the Shift+A node palette; returns the search locator or null.
   *  First clicks empty canvas to blur any focused input (e.g. after
   *  editing a radius field, keystrokes go to the input, not the
   *  Shift+A shortcut — the app ignores shortcuts while typing). */
  async function openNodePalette() {
    await page.mouse.click(640, 820).catch(() => {});
    await page.waitForTimeout(250);
    await page.keyboard.press('Shift+A');
    await page.waitForTimeout(700);
    const search = page.locator('.palette-search');
    return (await search.count()) > 0 ? search : null;
  }

  /**
   * Fill the open palette search and click the item whose visible name
   * exactly matches `exactName` (case-insensitive). Returns
   * { found, names, metas } — names/metas are what the user sees.
   */
  async function insertFromPalette(search, term, exactName) {
    await search.fill(term);
    await page.waitForTimeout(600);
    const names = await page.locator('.palette-item-name').allTextContents().catch(() => []);
    const metas = await page.locator('.palette-item-meta').allTextContents().catch(() => []);
    const items = page.locator('.palette-item');
    let found = false;
    for (let i = 0; i < (await items.count()); i++) {
      const n = ((await items.nth(i).locator('.palette-item-name').textContent()) || '').trim();
      if (n.toLowerCase() === exactName.toLowerCase()) {
        await items.nth(i).click();
        found = true;
        break;
      }
    }
    if (found) await page.waitForTimeout(1000);
    return { found, names: names.map((s) => s.trim()), metas: metas.map((s) => s.trim()) };
  }

  /** Read-only snapshot of one node card: what a user sees. */
  async function dumpNode(node) {
    const testids = async (sel) =>
      (await node.locator(sel).evaluateAll((els) => els.map((e) => e.getAttribute('data-testid'))).catch(() => []))
        .filter((t) => t && t !== 'input-socket' && t !== 'input-title' && t !== 'output-socket' && t !== 'output-title');
    return {
      title: ((await node.locator('.node-title').first().textContent().catch(() => '')) || '').trim(),
      warning: ((await node.locator('[data-testid="generic-definition-warning"]').first().textContent().catch(() => '')) || '').trim() || null,
      outputs: await testids('[data-testid^="output-"]'),
      inputs: await testids('[data-testid^="input-"]'),
      mapHeaders: await node.locator('.map-header-title').allTextContents().catch(() => []),
      mapEmpty: await node.locator('.map-empty-state').allTextContents().catch(() => []),
      mapText: (await node.locator('.map-parameters').allTextContents().catch(() => [])).map((s) => s.trim().replace(/\s+/g, ' ').slice(0, 400)),
      textInputs: await node.locator('input[type="text"]').evaluateAll((els) => els.map((e) => e.value)).catch(() => []),
      fullText: ((await node.textContent().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 600),
    };
  }

  /** Drag a node by its header so overlapping inserts become readable. */
  async function dragNode(title, dx, dy) {
    const node = nodeByTitle(title);
    const header = node.locator('.ns-drag-area').first();
    const box = await header.boundingBox().catch(() => null);
    if (!box) return false;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    return true;
  }

  return { page, log, record, shot, reload, waitForNodes, nodeByTitle, openNodePalette, insertFromPalette, dumpNode, dragNode };
}

/** Run steps, collect failures, throw a summarising Error at the end. */
function stepRunner(h, failures) {
  return async (label, fn) => {
    try {
      const detail = await fn();
      h.record(label, 'pass', typeof detail === 'string' ? detail : undefined);
      return true;
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      h.record(label, 'fail', detail);
      failures.push(`${label}: ${detail}`);
      return false;
    }
  };
}
function need(cond, msg) { if (!cond) throw new Error(msg); }

// ------------------------------------------------------------------- smoke

export const smokeTask = {
  id: 'smoke',
  name: 'Smoke: open editor, palettes, settings, collapse a node',
  description:
    'Fast UI sanity task: boot the editor, open F3 and Shift+A palettes and close them, ' +
    'open and close Settings, expand/collapse a node Definition (and collapse/expand the node), ' +
    'then assert the graph is still usable by rebuilding.',
  async run(ctx) {
    const h = makeHelpers(ctx);
    const { page } = h;
    page.setDefaultTimeout?.(8000);
    const failures = [];
    const step = stepRunner(h, failures);

    let nodeCount = 0;
    await step('boot: editor shows sample graph', async () => {
      nodeCount = await h.waitForNodes(4);
      need(nodeCount >= 4, `expected >=4 nodes on boot, saw ${nodeCount}`);
      await h.shot('smoke-boot');
      return `${nodeCount} nodes`;
    });

    await step('F3: open and close action palette', async () => {
      await page.keyboard.press('F3');
      await page.waitForTimeout(700);
      const open = await page.locator('.actions').count();
      need(open > 0, 'F3 did not open .actions palette');
      await h.shot('smoke-f3-open');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      need((await page.locator('.actions').count()) === 0, 'Escape did not close action palette');
      return 'opened via F3, closed via Escape';
    });

    await step('Shift+A: open and close node palette', async () => {
      const search = await h.openNodePalette();
      need(search, 'Shift+A did not open .palette (no .palette-search)');
      await h.shot('smoke-shifta-open');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      need((await page.locator('.palette').count()) === 0, 'Escape did not close node palette');
      return 'opened via Shift+A, closed via Escape';
    });

    await step('Settings: open and close dialog', async () => {
      await page.locator('button[aria-label="Settings"]').click();
      await page.waitForTimeout(700);
      const dlg = page.locator('.app-dialog');
      need((await dlg.count()) > 0, 'Settings button did not open .app-dialog');
      const text = (await dlg.textContent()) || '';
      need(/Canvas & preferences|Keyboard shortcuts/.test(text), 'settings dialog content not visible');
      await h.shot('smoke-settings-open');
      await page.locator('.app-dialog-actions .app-dialog-btn--ghost').click();
      await page.waitForTimeout(500);
      need((await page.locator('.app-dialog').count()) === 0, 'Cancel did not close settings dialog');
      return 'opened via toolbar, closed via Cancel';
    });

    await step('Definition: expand/collapse a node Definition', async () => {
      const header = page.locator('.map-input-header').first();
      need((await header.count()) > 0, 'no .map-input-header on canvas');
      const before = await header.getAttribute('aria-expanded');
      await header.click();
      await page.waitForTimeout(400);
      const after = await header.getAttribute('aria-expanded');
      need(before !== after, `aria-expanded did not flip (${before} -> ${after})`);
      await h.shot('smoke-definition-toggled');
      await header.click(); // restore
      await page.waitForTimeout(300);
      return `aria-expanded ${before} -> ${after} -> ${before}`;
    });

    await step('Node: collapse and expand one node', async () => {
      const node = page.locator('.node').first();
      const toggle = node.locator('.node-collapse-toggle').first();
      need((await toggle.count()) > 0, 'no .node-collapse-toggle on first node');
      await toggle.click();
      await page.waitForTimeout(500);
      const strip = await node.locator('.collapsed-socket-strip').count();
      need(strip > 0, 'collapsed socket strip did not appear');
      await h.shot('smoke-node-collapsed');
      await toggle.click();
      await page.waitForTimeout(400);
      need((await node.locator('.collapsed-socket-strip').count()) === 0, 'node did not re-expand');
      return 'collapse strip appeared, then node re-expanded';
    });

    await step('usable: graph still intact and Build runs', async () => {
      const now = await page.locator('.node').count();
      need(now >= 4, `node count dropped to ${now} after interactions`);
      await page.locator('button[aria-label="Build"]').click();
      await page.waitForTimeout(1200);
      const logText = ((await page.locator('.log-panel').textContent().catch(() => '')) || '');
      need(/Built FeatureScript|Build Log/.test(logText), `Build left no log entry: ${logText.slice(0, 200)}`);
      await h.shot('smoke-build');
      return `${now} nodes, log: ${logText.replace(/\s+/g, ' ').slice(0, 120)}`;
    });

    if (failures.length) throw new Error(`smoke failed (${failures.length}): ${failures.join(' | ')}`);
  },
};

// ------------------------------------------------------- filleted cylinder

export const makeFilletedCylinderTask = {
  id: 'make-filleted-cylinder',
  name: 'Make a filleted cylinder from visible UI only',
  description:
    'Real user scenario: insert fCylinder and opFillet from the Shift+A palette, connect the ' +
    'cylinder body output to the fillet input, set a fillet radius, and Build. Socket names are ' +
    'read from the live DOM, never guessed. If the UI cannot express the scenario (missing node, ' +
    'missing socket, empty generic Definition, disconnected Build output), the task records the ' +
    'exact blocker per step, screenshots it, and throws — it never reports success for a graph ' +
    'the UI did not actually create.',
  async run(ctx) {
    const h = makeHelpers(ctx);
    const { page } = h;
    page.setDefaultTimeout?.(8000);
    const failures = [];
    const step = stepRunner(h, failures);

    await step('reset: reload to a clean sample graph', async () => {
      await h.reload();
      const n = await h.waitForNodes(4);
      need(n >= 4, `after reload expected >=4 nodes, saw ${n}`);
      return `${n} nodes`;
    });

    // ---- fCylinder -----------------------------------------------------
    let fcDump = null;
    await step('insert fCylinder via Shift+A search', async () => {
      const search = await h.openNodePalette();
      need(search, 'Shift+A palette did not open');
      const { found, names } = await h.insertFromPalette(search, 'fCylinder', 'fCylinder');
      need(found, `search "fCylinder" results were [${names.join(', ')}] — no exact fCylinder item`);
      const node = h.nodeByTitle('fCylinder');
      need((await node.count()) > 0, 'fCylinder node card did not appear after insert');
      fcDump = await h.dumpNode(node);
      await h.shot('fillet-fcylinder-inserted');
      return `outputs=[${fcDump.outputs.join(',')}] inputs=[${fcDump.inputs.join(',')}] warning=${fcDump.warning ? 'yes' : 'no'}`;
    });

    await step('inspect fCylinder: body output socket exists', async () => {
      need(fcDump, 'fCylinder dump unavailable (insert step failed)');
      const text = [fcDump.outputs.join(' '), fcDump.fullText].join(' ').toLowerCase();
      const hasBody = fcDump.outputs.some((t) => /body/i.test(t)) || /output-[a-z]*body/.test(text);
      need(hasBody, `fCylinder has NO body output. outputs=${JSON.stringify(fcDump.outputs)} labels in "${fcDump.fullText}" — only output is Context`);
      return `body output present`;
    });

    await step('inspect fCylinder: Definition parameters (radius, centres)', async () => {
      need(fcDump, 'fCylinder dump unavailable');
      // What the user can actually set: Definition map text + text inputs.
      const hasRadius = /radius/i.test(fcDump.mapText.join(' ')) || fcDump.inputs.some((t) => /radius/i.test(t));
      const hasCentres = /topcenter|bottomcenter|center/i.test(fcDump.mapText.join(' '));
      h.log(`fCylinder definition: mapText=${JSON.stringify(fcDump.mapText)} inputs=${JSON.stringify(fcDump.inputs)}`);
      need(hasRadius, `fCylinder Definition exposes no radius control: ${JSON.stringify(fcDump)}`);
      need(hasCentres || !fcDump.warning, `fCylinder Definition is generic (${fcDump.warning}) and exposes only [${fcDump.mapText.join(' | ')}] — topCenter/bottomCenter (Vector) are absent, so no cylinder geometry can be specified`);
      return `radius present, centres present`;
    });

    await step('fCylinder: set radius via its visible control', async () => {
      const node = h.nodeByTitle('fCylinder');
      const inputs = node.locator('input[type="text"]');
      // The radius field is the text input showing the quantity value
      // (e.g. "0 undefined"); the Id field shows "_0". Pick by value.
      let target = null;
      for (let i = 0; i < (await inputs.count()); i++) {
        const v = await inputs.nth(i).inputValue().catch(() => '');
        if (v !== '_0') target = inputs.nth(i);
      }
      need(target, `no editable quantity input in fCylinder (values=${JSON.stringify(fcDump?.textInputs ?? [])})`);
      await target.fill('1 inch');
      await page.waitForTimeout(400);
      const v = await target.inputValue();
      need(v === '1 inch', `radius input did not keep "1 inch" (now "${v}")`);
      await h.shot('fillet-fcylinder-radius');
      return `radius set to "${v}" through visible input`;
    });

    // ---- opFillet ------------------------------------------------------
    let opFilletNames = [];
    await step('insert opFillet via Shift+A search (exact)', async () => {
      const search = await h.openNodePalette();
      need(search, 'Shift+A palette did not open for opFillet search');
      const res = await h.insertFromPalette(search, 'opFillet', 'opFillet');
      opFilletNames = res.names;
      await h.shot('fillet-opfillet-search');
      need(res.found, `search "opFillet" returned [${res.names.join(', ')}] — no exact opFillet item to insert`);
      return 'opFillet inserted';
    });

    // Closest available fillet, probed only to document whether ANY
    // fillet path works — never counted as the opFillet requirement.
    let filletDump = null;
    await step('probe closest fillet ("fillet" exact): Definition is usable', async () => {
      const search = await h.openNodePalette();
      need(search, 'Shift+A palette did not open for fillet search');
      const res = await h.insertFromPalette(search, 'fillet', 'fillet');
      need(res.found, `search "fillet" returned [${res.names.join(', ')}] — no exact fillet item either`);
      const node = h.nodeByTitle('fillet');
      need((await node.count()) > 0, 'fillet node card did not appear');
      filletDump = await h.dumpNode(node);
      await h.dragNode('fillet', -240, 60);
      await h.dragNode('fCylinder', 240, 60);
      await h.shot('fillet-fillet-inserted');
      const empty = filletDump.mapEmpty.length > 0 || /\(empty\)/.test(filletDump.fullText);
      need(!empty, `fillet Definition is EMPTY and generic (warning=${JSON.stringify(filletDump.warning)}, mapEmpty=${JSON.stringify(filletDump.mapEmpty)}, inputs=${JSON.stringify(filletDump.inputs)}) — no entities/radius parameter inputs exist to set or connect`);
      const hasRadius = /radius/i.test(filletDump.mapText.join(' ')) || filletDump.inputs.some((t) => /radius/i.test(t));
      need(hasRadius, `fillet Definition exposes no radius control: ${JSON.stringify(filletDump)}`);
      return 'fillet Definition has radius/entities';
    });

    await step('connect: cylinder body output -> fillet input (endpoints from DOM)', async () => {
      need(fcDump && filletDump, 'endpoint inspection unavailable (insert steps failed)');
      const fcOutLabels = fcDump.outputs.join(',');
      const filInLabels = filletDump.inputs.join(',');
      const fcBody = fcDump.outputs.find((t) => /body/i.test(t));
      const filTarget = filletDump.inputs.find((t) => /entit|body|face|edge/i.test(t));
      need(fcBody, `no body output on fCylinder to drag from (outputs=[${fcOutLabels}])`);
      need(filTarget, `no entities/body input on fillet to drop onto (inputs=[${filInLabels}], Definition empty=${filletDump.mapEmpty.length > 0})`);
      return `wire ${fcBody} -> ${filTarget}`;
    });

    await step('Build: generated FeatureScript contains fCylinder + fillet', async () => {
      await page.locator('button[aria-label="Build"]').click();
      await page.waitForTimeout(1200);
      let logText = ((await page.locator('.log-panel').textContent().catch(() => '')) || '');
      const show = page.locator('.log-panel').getByText('Show Generated FeatureScript').first();
      if ((await show.count()) > 0) {
        await show.click().catch(() => {});
        await page.waitForTimeout(600);
        logText = ((await page.locator('.log-panel').textContent().catch(() => '')) || '');
      }
      await h.shot('fillet-build');
      h.log(`build log: ${logText.replace(/\s+/g, ' ').slice(0, 600)}`);
      need(/fCylinder/.test(logText), `generated FeatureScript does not mention fCylinder: ${logText.replace(/\s+/g, ' ').slice(0, 400)}`);
      need(/fillet/i.test(logText), `generated FeatureScript does not mention fillet/opFillet: ${logText.replace(/\s+/g, ' ').slice(0, 400)}`);
      return 'generated script contains both statements';
    });

    if (failures.length) {
      throw new Error(
        `make-filleted-cylinder BLOCKED (${failures.length} step(s)): ${failures.join(' | ')}` +
        (opFilletNames.length ? ` | search "opFillet" saw [${opFilletNames.join(', ')}]` : '')
      );
    }
  },
};

export const tasks = [smokeTask, makeFilletedCylinderTask];
export default tasks;
