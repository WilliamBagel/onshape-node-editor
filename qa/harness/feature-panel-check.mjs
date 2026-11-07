#!/usr/bin/env node
// Feature panel + group live-I/O browser check (user complaints).
//
// Permanent harness (qa:feature-panel) — reproduces the exact user complaints
// on the real app and FAILS if they regress:
//   1. Feature parameter toolbar discoverability: clicking a Define Feature
//      node opens FeatureConfigPanel automatically; closing it leaves a
//      visible `feature-panel-open-rail` / TopBar control that reopens it.
//   2. Feature parameter editing: add `qaProbe`, rename, retype to
//      numberValueWithUnits, remove — asserting editor state, node DOM,
//      serialization round-trip and no dangling wires.
//   3. Type picker width/contrast in BOTH FeatureConfigPanel and
//      GroupConfigPanel: no clipped labels, dark ink on white (>= 4.5:1),
//      socket colour only on the swatch dot.
//   4. Group toolbar discoverability + live I/O: group the two Chamfer
//      nodes, enter, `group-panel-open-rail` while closed, Start Feature
//      opens the panel, add `qaGroupIn`, exit and immediately see it on the
//      Group 1 instance (DOM + editor inputs) without clicking/dragging;
//      remove, exit, assert it is gone with no dangling connection.
//   5. No member-socket dropdown / candidate select anywhere, no dialogs.
//
// Driven with real mouse/keyboard (Playwright mouse/keyboard). Editor state
// is read through window.controls — the same controls the UI calls (exposed
// in App.vue for this purpose), never a re-implementation. Report is JSON
// only (no HTML written by the harness) under tmp/qa-runs/feature-panel/.
//
// Usage: QA_URL=http://127.0.0.1:5214/onshape-node-editor/ node qa/harness/feature-panel-check.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const URL = process.env.QA_URL ?? 'http://127.0.0.1:5214/onshape-node-editor/';
const OUT = 'tmp/qa-runs/feature-panel/';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${String(detail).slice(0, 400)}` : ''}`;
  console.log(line);
  results.push({ name, ok: !!ok, detail: String(detail) });
}
const dialogs = [];
const CONSOLE = [];

// rete renders one `.node` element per editor node, but `area.update("node")`
// destroys/recreates the view and re-appends it, so DOM order is NOT stable.
// Nodes are therefore located by their visible title (unique in this graph,
// except the two Chamfers, which use occurrence order).
async function nodeDomText(page, title) {
  return page.evaluate((t) => {
    const el = [...document.querySelectorAll('.node')].find(
      (e) => e.querySelector('.node-title')?.textContent?.trim() === t,
    );
    return el?.textContent ?? '';
  }, title);
}

// Real mouse click on a node's header (title bar), like a user would.
async function clickNode(page, title, occurrence = 0) {
  const box = await page.evaluate(
    ([t, occ]) => {
      const els = [...document.querySelectorAll('.node')].filter(
        (e) => e.querySelector('.node-title')?.textContent?.trim() === t,
      );
      const el = els[occ];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + Math.min(80, r.width / 2), y: r.top + 12 };
    },
    [title, occurrence],
  );
  if (!box) throw new Error(`node titled "${title}" occurrence ${occurrence} not found`);
  await page.mouse.click(box.x, box.y);
}

// Locator click with the keyboard held down (raw CDP mouse.click drops the
// modifier state, so Shift+click accumulation needs a real locator click).
async function clickNodeHeld(page, title, occurrence = 0) {
  const loc = page.locator('.node', { hasText: title }).nth(occurrence);
  await loc.click({ position: { x: 80, y: 12 } });
}

async function measureTypePicker(page, pickerTestId) {
  await page.getByTestId(`${pickerTestId}-button`).first().click();
  await sleep(300);
  const m = await page.evaluate((picker) => {
    const root = document.querySelector(`[data-testid="${picker}"]`);
    const btnEl = root?.querySelector('button');
    const btnLabel = root?.querySelector('.type-picker-label');
    const opt = root?.querySelector('[data-value="numberValueWithUnits"]');
    const optLabel = opt?.querySelector('.type-picker-option-label');
    const dot = opt?.querySelector('.type-picker-dot');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const lum = (rgb) => {
      const [r, g, b] = rgb.match(/\d+/g).map(Number);
      const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const optCs = cs(optLabel);
    // The option itself is transparent; the effective background is the
    // first opaque ancestor (the listbox / surface, i.e. white).
    let bgEl = opt;
    let optBg = 'rgba(0, 0, 0, 0)';
    while (bgEl != null) {
      const c = cs(bgEl)?.backgroundColor ?? '';
      if (c !== '' && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { optBg = c; break; }
      bgEl = bgEl.parentElement;
    }
    const ratio = optCs ? (lum(optBg) + 0.05) / (lum(optCs.color) + 0.05) : 0;
    return {
      btnText: btnLabel?.textContent ?? '',
      btnScroll: btnEl?.scrollWidth ?? 0, btnClient: btnEl?.clientWidth ?? 0,
      optText: optLabel?.textContent ?? '',
      optScroll: opt?.scrollWidth ?? 0, optClient: opt?.clientWidth ?? 0,
      optLabelScroll: optLabel?.scrollWidth ?? 0, optLabelClient: optLabel?.clientWidth ?? 0,
      optColor: optCs?.color ?? '', optBg, ratio: Math.round(ratio * 100) / 100,
      dotBg: cs(dot)?.backgroundColor ?? '',
    };
  }, pickerTestId);
  await page.keyboard.press('Escape');
  await sleep(200);
  return {
    m,
    noClip: m.btnScroll <= m.btnClient && m.optScroll <= m.optClient && m.optLabelScroll <= m.optLabelClient,
    fullLabel: m.optText.includes('numberValueWithUnits'),
    darkInk: m.ratio >= 4.5,
    colorOnlyOnDot: m.optColor !== m.dotBg && m.dotBg !== '',
  };
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss().catch(() => {}); });
  page.on('console', (m) => { if (m.type() === 'error') CONSOLE.push(m.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.controls != null && typeof window.controls.getDefineFeatureState === 'function'
      && window.editor?.getNodes?.().length >= 4,
    null, { timeout: 45000 },
  );
  await sleep(800);

  const defineNodeId = await page.evaluate(() => {
    const n = window.editor.getNodes().find((x) => window.controls.isDefineFeatureNode(x.id));
    return n?.id ?? null;
  });
  check('setup: Define Feature node exists', defineNodeId != null, `id=${defineNodeId}`);

  // ---- Case 1: discoverability ----
  await clickNode(page, 'My New Feature');
  await sleep(700);
  const panel = page.getByTestId('feature-config-panel');
  check('1: clicking Define Feature opens FeatureConfigPanel', await panel.isVisible().catch(() => false));
  check('1: panel shows "Feature parameters"', ((await panel.textContent().catch(() => '')) ?? '').includes('Feature parameters'));
  const featName = await page.getByTestId('feature-name-input').inputValue().catch(() => '');
  check('1: panel shows feature name', featName.length > 0, featName);
  const rowsAtOpen = await page.getByTestId('feature-param-row').count();
  check('1: panel shows parameter rows', rowsAtOpen > 0, `rows=${rowsAtOpen}`);

  await page.getByTestId('feature-config-close').click();
  await sleep(500);
  check('1: panel closes via close button', !(await panel.isVisible().catch(() => false)));
  const rail = page.getByTestId('feature-panel-open-rail');
  const topbarBtn = page.getByTestId('feature-parameters-button');
  check('1: feature-panel-open-rail visible after close', await rail.isVisible().catch(() => false), await rail.textContent().catch(() => ''));
  check('1: TopBar Feature parameters control visible after close', await topbarBtn.isVisible().catch(() => false));
  await rail.click();
  await sleep(500);
  check('1: rail reopens the panel', await panel.isVisible().catch(() => false));
  await topbarBtn.click(); // toggles closed while open
  await sleep(500);
  check('1: TopBar button closes the open panel', !(await panel.isVisible().catch(() => false)));
  await rail.click();
  await sleep(500);
  check('1: rail reopens again for editing cases', await panel.isVisible().catch(() => false));

  // ---- Case 2: parameter editing ----
  const rowsBefore = await page.getByTestId('feature-param-row').count();
  await page.getByTestId('feature-new-param-name').fill('qaProbe');
  await page.getByTestId('feature-add-param').click();
  await sleep(700);
  const rowsAfterAdd = await page.getByTestId('feature-param-row').count();
  check('2: add qaProbe creates a new row', rowsAfterAdd === rowsBefore + 1, `${rowsBefore} -> ${rowsAfterAdd}`);
  let state = await page.evaluate(() => window.controls.getDefineFeatureState());
  check('2: state includes definition.qaProbe', state?.parameters?.some((p) => p.socketKey === 'definition.qaProbe') ?? false, JSON.stringify(state?.parameters));
  check('2: node DOM exposes qaProbe output label', (await nodeDomText(page, 'My New Feature')).includes('qaProbe'));

  const serialized = await page.evaluate(() => window.controls.serializeGraph());
  check('2: serializeGraph round-trip includes qaProbe', serialized.includes('qaProbe'));

  const probeRow = page.getByTestId('feature-param-row').filter({ hasText: 'definition.qaProbe' }).first();
  await probeRow.locator('input[type="text"]').first().fill('qaProbeRenamed');
  await page.keyboard.press('Tab');
  await sleep(700);
  state = await page.evaluate(() => window.controls.getDefineFeatureState());
  check('2: rename re-keys state to definition.qaProbeRenamed', state?.parameters?.some((p) => p.socketKey === 'definition.qaProbeRenamed') ?? false, JSON.stringify(state?.parameters));
  check('2: rename updates node DOM', (await nodeDomText(page, 'My New Feature')).includes('qaProbeRenamed'));

  const renamedRow = page.getByTestId('feature-param-row').filter({ hasText: 'definition.qaProbeRenamed' }).first();
  await renamedRow.locator('[data-testid$="-button"]').first().click();
  await sleep(300);
  await page.locator('[data-value="numberValueWithUnits"]').first().click();
  await sleep(700);
  state = await page.evaluate(() => window.controls.getDefineFeatureState());
  const renamed = state?.parameters?.find((p) => p.socketKey === 'definition.qaProbeRenamed');
  check('2: retype sets valueType numberValueWithUnits', renamed?.valueType === 'numberValueWithUnits', JSON.stringify(renamed));

  const renamedRow2 = page.getByTestId('feature-param-row').filter({ hasText: 'definition.qaProbeRenamed' }).first();
  await renamedRow2.getByTestId('feature-param-remove').click();
  await sleep(700);
  const rowsAfterRemove = await page.getByTestId('feature-param-row').count();
  check('2: remove deletes the row', rowsAfterRemove === rowsAfterAdd - 1, `${rowsAfterAdd} -> ${rowsAfterRemove}`);
  state = await page.evaluate(() => window.controls.getDefineFeatureState());
  check('2: remove clears state', !(state?.parameters?.some((p) => p.socketKey.includes('qaProbe')) ?? false));
  check('2: remove clears node DOM label', !(await nodeDomText(page, 'My New Feature')).includes('qaProbe'));
  const dangling = await page.evaluate(() => window.editor.getConnections().filter((c) => c.sourceOutput.includes('qaProbe') || c.targetInput.includes('qaProbe')).length);
  check('2: no dangling wire after remove', dangling === 0, `dangling=${dangling}`);

  // ---- Case 3a: type picker in FeatureConfigPanel ----
  await page.getByTestId('feature-new-param-type-button').click();
  await sleep(300);
  await page.locator('[data-value="numberValueWithUnits"]').first().click();
  await sleep(300);
  const feat = await measureTypePicker(page, 'feature-new-param-type');
  check('3a: feature picker selected label not clipped', feat.noClip, `btn=${feat.m.btnScroll}/${feat.m.btnClient} opt=${feat.m.optScroll}/${feat.m.optClient}`);
  check('3a: feature picker option shows full label', feat.fullLabel, feat.m.optText);
  check('3a: feature picker option dark ink >=4.5:1', feat.darkInk, `ratio=${feat.m.ratio} color=${feat.m.optColor} bg=${feat.m.optBg}`);
  check('3a: feature picker socket colour only on dot', feat.colorOnlyOnDot, `dot=${feat.m.dotBg} label=${feat.m.optColor}`);

  // ---- Case 4: group discoverability + live I/O ----
  await page.getByTestId('feature-config-close').click();
  await sleep(500);
  const chamfers = await page.evaluate(() => window.editor.getNodes().filter((n) => n.type === 'CustomFeature').map((n) => n.id));
  check('4: two CustomFeature (Chamfer) nodes exist', chamfers.length >= 2, chamfers.join(','));
  // Select the two Chamfers with element handles (the defect-checks recipe):
  // DOM order of the two untouched Chamfer nodes is stable here.
  const ts = await page.evaluate(() => [...document.querySelectorAll('.node')].map((e) => e.querySelector('.node-title')?.textContent?.trim()));
  const nodesH = await page.$$('.node');
  check('4: first two DOM nodes are the Chamfers', ts[0] === 'Chamfer' && ts[1] === 'Chamfer', JSON.stringify(ts.slice(0, 4)));
  await nodesH[0].click({ position: { x: 80, y: 12 } });
  await sleep(400);
  await page.keyboard.down('Shift');
  await nodesH[1].click({ timeout: 3000 });
  await page.keyboard.up('Shift');
  await sleep(500);
  const selectedCount = await page.evaluate(() => window.editor.getNodes().filter((n) => n.selected).length);
  check('4: both Chamfer nodes selected', selectedCount >= 2, `selected=${selectedCount}`);
  await page.getByRole('button', { name: 'Create group from selection' }).click();
  await sleep(1200);
  const groupId = await page.evaluate(() => window.editor.getNodes().find((n) => String(n.type).toLowerCase().includes('group'))?.id ?? null);
  check('4: group instance created', groupId != null, `id=${groupId}`);
  check('4: Group 1 instance shows its title', (await nodeDomText(page, 'Group 1')).includes('Group 1'), (await nodeDomText(page, 'Group 1')).slice(0, 80));

  await clickNode(page, 'Group 1');
  await sleep(400);
  await page.keyboard.press('Tab');
  await sleep(1200);
  const inGroup = await page.evaluate(() => window.editor.getNodes().some((n) => n.type === 'CustomFeature'));
  check('4: Tab enters the group (members visible)', inGroup);
  const groupRail = page.getByTestId('group-panel-open-rail');
  check('4: group-panel-open-rail visible while panel closed', await groupRail.isVisible().catch(() => false), await groupRail.textContent().catch(() => ''));

  // Click the Start Feature boundary card -> panel opens.
  const domTitles = await page.evaluate(() => [...document.querySelectorAll('.node')].map((e) => e.querySelector('.node-title')?.textContent?.trim() ?? ''));
  const startTitle = domTitles.find((t) => /start/i.test(t)) ?? null;
  let startOpened = false;
  if (startTitle != null) {
    await clickNode(page, startTitle).catch(() => {});
    await sleep(600);
    startOpened = await page.getByTestId('group-config-panel').isVisible().catch(() => false);
  }
  check('4: clicking Start Feature opens group panel', startOpened, JSON.stringify(domTitles));
  if (!startOpened) {
    await groupRail.click().catch(() => {});
    await sleep(600);
    check('4: rail opens group panel (fallback path)', await page.getByTestId('group-config-panel').isVisible().catch(() => false));
  }

  // ---- Case 3b: type picker in GroupConfigPanel ----
  const grp = await measureTypePicker(page, 'group-add-input-type');
  check('3b: group picker selected label not clipped', grp.noClip, `btn=${grp.m.btnScroll}/${grp.m.btnClient} opt=${grp.m.optScroll}/${grp.m.optClient}`);
  check('3b: group picker option shows full label', grp.fullLabel, grp.m.optText);
  check('3b: group picker option dark ink >=4.5:1', grp.darkInk, `ratio=${grp.m.ratio} color=${grp.m.optColor} bg=${grp.m.optBg}`);
  check('3b: group picker socket colour only on dot', grp.colorOnlyOnDot, `dot=${grp.m.dotBg} label=${grp.m.optColor}`);

  // Add group input qaGroupIn.
  await page.getByTestId('group-config-panel').getByLabel('Label for a new group input').fill('qaGroupIn');
  await page.getByTestId('group-add-input').click();
  await sleep(800);
  const boundary = await page.evaluate(() => window.controls.getGroupBoundaryState());
  check('4: add qaGroupIn appears in boundary state', boundary?.inputs?.some((s) => s.label === 'qaGroupIn') ?? false, JSON.stringify(boundary?.inputs?.map((s) => s.label)));

  // Exit the group (Tab from canvas) and immediately assert live instance.
  await page.locator('.rete').click({ position: { x: 30, y: 30 } });
  await sleep(300);
  await page.keyboard.press('Tab');
  await sleep(1200);
  const instanceNow = await page.evaluate(() => {
    const n = window.editor.getNodes().find((x) => String(x.type).toLowerCase().includes('group'));
    if (n == null) return null;
    return {
      id: n.id,
      inputKeys: Object.keys(n.inputs ?? {}),
      inputLabels: Object.values(n.inputs ?? {}).map((i) => i.label ?? i.socket?.name ?? '?'),
    };
  });
  const instDomText = await nodeDomText(page, 'Group 1');
  check('4: exit -> Group 1 instance DOM immediately shows qaGroupIn (no click/drag)', instDomText.includes('qaGroupIn'), instDomText.slice(0, 200));
  check('4: exit -> editor instance inputs has matching key/label',
    (instanceNow?.inputLabels?.includes('qaGroupIn') ?? false) || (instanceNow?.inputKeys?.some((k) => k.includes('qaGroupIn')) ?? false),
    JSON.stringify(instanceNow));

  // Re-enter, remove, exit, assert gone.
  await clickNode(page, 'Group 1');
  await sleep(400);
  await page.keyboard.press('Tab');
  await sleep(1200);
  // Wait for the re-entered panel to list the qaGroupIn row (panel may open
  // via the rail if Start/End selection did not trigger it).
  // The row label lives in the name input's value (not textContent), so
  // presence is checked via the input value.
  const rowPresent = () => page
    .waitForFunction(
      () => [...document.querySelectorAll('[data-testid="group-input-row"]')].some(
        (e) => e.querySelector('input')?.value === 'qaGroupIn',
      ),
      null, { timeout: 6000 },
    )
    .then(() => true)
    .catch(() => false);
  const rowReady = await rowPresent();
  if (!rowReady) {
    await page.getByTestId('group-panel-open-rail').click().catch(() => {});
    await sleep(800);
  }
  check('4: re-entered group panel lists qaGroupIn row', await rowPresent());
  await page.getByRole('button', { name: 'Remove input qaGroupIn' }).click();
  await sleep(800);
  await page.locator('.rete').click({ position: { x: 30, y: 30 } });
  await sleep(300);
  await page.keyboard.press('Tab');
  await sleep(1200);
  const instDomText2 = await nodeDomText(page, 'Group 1');
  check('4: remove + exit -> instance no longer shows qaGroupIn', !instDomText2.includes('qaGroupIn'), instDomText2.slice(0, 200));
  const danglingG = await page.evaluate(() => window.editor.getConnections().filter((c) => c.sourceOutput.includes('qaGroupIn') || c.targetInput.includes('qaGroupIn')).length);
  check('4: no dangling group connection after remove', danglingG === 0, `dangling=${danglingG}`);

  // ---- Case 5: global ----
  // The complaint removed the member-socket `.candidate-select` dropdown.
  // Legitimate `<select>` elements elsewhere (SettingsDialog modifier pickers,
  // LogPanel severity filter) are pre-existing and unrelated, so the ban is
  // scoped to the candidate-select class + panel-scoped selects.
  check('5: no candidate select anywhere', (await page.locator('.candidate-select').count()) === 0);
  check('5: no <select> inside feature/group panels', (await page.locator('[data-testid="feature-config-panel"] select, [data-testid="group-config-panel"] select').count()) === 0);
  check('5: no "Select a member socket" anywhere', !((await page.locator('body').textContent().catch(() => '')) ?? '').includes('Select a member socket'));
  check('5: no browser dialogs fired', dialogs.length === 0, dialogs.join(' | '));
  check('5: no page console errors', CONSOLE.length === 0, CONSOLE.slice(0, 3).join(' | '));

  await page.screenshot({ path: path.join(OUT, 'feature-panel-final.png'), fullPage: false }).catch(() => {});
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({
    url: URL, when: new Date().toISOString(), passed: failed.length === 0, checks: results, dialogs,
  }, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Report: ${path.join(OUT, 'report.json')}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ passed: false, error: String(err), checks: results, dialogs }, null, 2));
  process.exit(1);
});
