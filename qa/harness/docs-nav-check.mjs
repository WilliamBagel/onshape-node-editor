#!/usr/bin/env node
// Documentation navigation browser check (qa:docs-nav).
//
// Permanent harness on port 5226: drives the REAL app with Playwright mouse
// and keyboard (no synthetic dispatch, no re-implementation) and asserts:
//   1. The TopBar Help button (aria-label "Documentation") opens the in-app
//      DocumentationPanel — never a browser tab/window/dialog.
//   2. The General / Design practice / Nodes section tabs are reachable and
//      switch the article.
//   3. Searching "fillet" finds a node topic (row + category meta + article).
//   4. Escape closes the panel.
//   5. A node's own help button opens the documentation at that node's topic.
//   6. The group breadcrumb is interactive: clicking an ancestor segment
//      leaves the group in one step (and the explicit "Exit group" control
//      keeps the one-level behaviour).
//   7. No console errors, page errors or browser dialogs during the run.
//
// Usage:
//   pnpm exec vite --port 5226 --host 127.0.0.1   (or the build/preview server)
//   QA_URL=http://127.0.0.1:5226/onshape-node-editor/ pnpm qa:docs-nav
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.QA_URL ?? 'http://127.0.0.1:5226/onshape-node-editor/';
const OUT = 'tmp/qa-runs/docs-nav/';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const checks = [];

function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${String(detail).slice(0, 400)}` : ''}`;
  console.log(line);
  checks.push({ name, ok: !!ok, detail: String(detail) });
  if (!ok) failures.push(name);
}

const consoleErrors = [];
const pageErrors = [];
const dialogs = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('dialog', async (dialog) => {
  dialogs.push(dialog.message());
  await dialog.dismiss().catch(() => {});
});

const shot = async (name) => {
  const file = `${OUT}${name}`;
  await page.screenshot({ path: file });
  return file;
};

const nodeTitles = () => page.evaluate(() =>
  [...document.querySelectorAll('.node')].map((el) => (el.querySelector('.node-title')?.textContent ?? '').trim()),
);

/** Click a node by its exact visible title, at the header (a real mouse click). */
async function clickNodeByTitle(title) {
  const box = await page.evaluate((wanted) => {
    const el = [...document.querySelectorAll('.node')]
      .find((node) => (node.querySelector('.node-title')?.textContent ?? '').trim() === wanted);
    if (el == null) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + Math.min(80, rect.width / 2), y: rect.top + 12 };
  }, title);
  if (box == null) throw new Error(`node titled "${title}" not found`);
  await page.mouse.click(box.x, box.y);
}

const panelVisible = () => page.locator('.docs-panel').isVisible().catch(() => false);
const articleTitle = () => page.locator('.docs-article-title').textContent();
const crumbText = () => page.locator('.docs-crumb').textContent();

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(
  () => window.controls != null && typeof window.controls.createGroupFromSelection === 'function'
    && window.editor?.getNodes?.().length >= 4,
  null,
  { timeout: 45000 },
);
await sleep(1000);
await shot('01-default-graph.png');

// ── 1. TopBar Help opens the panel ─────────────────────────────────────────
try {
  const help = page.locator('button[aria-label="Documentation"]');
  check('TopBar has a Help button labelled Documentation', await help.count() === 1, `count=${await help.count()}`);
  await help.click({ timeout: 5000 });
  await page.waitForSelector('.docs-panel', { timeout: 5000 });
  check('Help button opens the DocumentationPanel', await panelVisible());
  check('panel is titled "Documentation"', (await page.locator('#docs-panel-title').textContent()) === 'Documentation');
  await shot('02-docs-opened.png');
} catch (error) {
  check('Help button opens the DocumentationPanel', false, error.message);
}

// ── 2. Section tabs are reachable ──────────────────────────────────────────
try {
  const tabs = page.locator('.docs-section-tab');
  const tabText = (await tabs.allTextContents()).map((text) => text.trim());
  check('section tabs are General / Design practice / Nodes', JSON.stringify(tabText) === JSON.stringify(['General', 'Design practice', 'Nodes']), JSON.stringify(tabText));

  await page.locator('.docs-section-tab[data-section="design-practice"]').click();
  await sleep(150);
  check('Design practice section is reachable', (await page.locator('.docs-section-tab[data-section="design-practice"]').getAttribute('aria-pressed')) === 'true'
    && (await crumbText()).includes('Design practice'), await crumbText());

  await page.locator('.docs-section-tab[data-section="nodes"]').click();
  await sleep(150);
  check('Nodes section is reachable', (await page.locator('.docs-section-tab[data-section="nodes"]').getAttribute('aria-pressed')) === 'true'
    && (await crumbText()).includes('Nodes'), await crumbText());

  await page.locator('.docs-section-tab[data-section="general"]').click();
  await sleep(150);
  check('General section is reachable', (await page.locator('.docs-section-tab[data-section="general"]').getAttribute('aria-pressed')) === 'true'
    && (await crumbText()).includes('General'), await crumbText());
  await shot('03-docs-sections.png');
} catch (error) {
  check('section tabs reachable', false, error.message);
}

// ── 3. Search finds a node ─────────────────────────────────────────────────
try {
  await page.fill('input.docs-search', 'fillet');
  await page.waitForSelector('.docs-nav-item', { timeout: 5000 });
  await sleep(250);
  const firstRow = page.locator('.docs-nav-item').first();
  const rowName = (await firstRow.locator('.docs-nav-name').textContent()).trim();
  const rowMeta = (await firstRow.locator('.docs-nav-meta').textContent().catch(() => '')).trim();
  check('search "fillet" finds a node', /fillet/i.test(rowName), `first row=${rowName}`);
  check('search result is labelled as a node category', rowMeta.length > 0, `meta=${rowMeta}`);
  check('search previews the Fillet article', /fillet/i.test(await articleTitle()), await articleTitle());
  await shot('04-docs-search.png');
} catch (error) {
  check('search "fillet" finds a node', false, error.message);
}

// ── 4. Escape closes ───────────────────────────────────────────────────────
try {
  await page.locator('input.docs-search').press('Escape');
  await page.waitForSelector('.docs-panel', { state: 'detached', timeout: 5000 });
  check('Escape closes the documentation panel', !(await panelVisible()));
} catch (error) {
  check('Escape closes the documentation panel', false, error.message);
}

// ── 5. A node's help button opens its own topic ────────────────────────────
try {
  const nodeHelp = page.locator('.node', { hasText: 'Chamfer' }).first()
    .locator('button[aria-label="Open documentation for Chamfer"]');
  check('node cards have an in-app help button', await nodeHelp.count() > 0, `count=${await nodeHelp.count()}`);
  await nodeHelp.scrollIntoViewIfNeeded();
  await nodeHelp.click({ timeout: 5000 });
  await page.waitForSelector('.docs-panel', { timeout: 5000 });
  await sleep(250);
  check('node help opens its topic', (await articleTitle()).trim() === 'Chamfer', await articleTitle());
  check('node help opens the Nodes section', (await crumbText()).includes('Nodes'), await crumbText());
  await shot('05-node-help-topic.png');

  await page.keyboard.press('Escape');
  await page.waitForSelector('.docs-panel', { state: 'detached', timeout: 5000 });
  check('Escape closes the node-help panel', !(await panelVisible()));
} catch (error) {
  check('node help opens its topic', false, error.message);
}

// ── 6. Breadcrumb navigation ───────────────────────────────────────────────
try {
  const before = await nodeTitles();
  const chamferCount = before.filter((title) => title === 'Chamfer').length;
  check('default graph has the two Chamfer nodes to group', chamferCount >= 2, JSON.stringify(before));

  await clickNodeByTitle('Chamfer');
  await sleep(200);
  await page.keyboard.down('Shift');
  const secondChamfer = page.locator('.node', { hasText: 'Chamfer' }).nth(1);
  await secondChamfer.click({ position: { x: 80, y: 12 }, timeout: 5000 });
  await page.keyboard.up('Shift');
  await sleep(250);

  await page.click('button[aria-label="Create group from selection"]', { timeout: 5000 });
  await sleep(1200);
  const afterCreate = await nodeTitles();
  const groupTitle = afterCreate.find((title) => /^Group \d+$/.test(title));
  check('creating a group leaves a Group instance', groupTitle != null, JSON.stringify(afterCreate));

  if (groupTitle != null) {
    await clickNodeByTitle(groupTitle);
    await sleep(250);
    await page.keyboard.press('Tab');
    await page.waitForSelector('.group-breadcrumb', { timeout: 5000 }).catch(() => {});
    const breadcrumb = page.locator('.group-breadcrumb');
    check('Tab enters the group and shows the breadcrumb', await breadcrumb.count() === 1, await breadcrumb.textContent().catch(() => ''));
    check('breadcrumb shows "Top level" and the group', (await breadcrumb.textContent().catch(() => '')).includes('Top level')
      && (await breadcrumb.textContent().catch(() => '')).includes(groupTitle), await breadcrumb.textContent().catch(() => ''));
    const exitToTop = page.locator('button[aria-label="Exit to Top level"]');
    check('Top level is a real breadcrumb button', await exitToTop.count() === 1);
    await shot('06-group-breadcrumb.png');

    await exitToTop.click({ timeout: 5000 });
    await page.waitForSelector('.group-breadcrumb', { state: 'detached', timeout: 8000 }).catch(() => {});
    await sleep(800);
    check('clicking the Top level segment exits the group in one step', await page.locator('.group-breadcrumb').count() === 0);
    check('the canvas shows the top-level graph again', (await nodeTitles()).some((title) => title === 'Chamfer'));
    await shot('07-group-exited-by-breadcrumb.png');

    // Explicit one-level control: re-enter, then use "Exit group".
    await clickNodeByTitle(groupTitle);
    await sleep(250);
    await page.keyboard.press('Tab');
    await page.waitForSelector('.group-breadcrumb', { timeout: 5000 }).catch(() => {});
    const exitGroup = page.locator('button[aria-label="Exit group"]');
    check('explicit Exit group control is present', await exitGroup.count() === 1);
    await exitGroup.click({ timeout: 5000 });
    await page.waitForSelector('.group-breadcrumb', { state: 'detached', timeout: 8000 }).catch(() => {});
    await sleep(800);
    check('Exit group leaves exactly one level', await page.locator('.group-breadcrumb').count() === 0);
  }
} catch (error) {
  check('breadcrumb navigation', false, error.message);
}

// ── 7. Errors ──────────────────────────────────────────────────────────────
check('no browser dialogs', dialogs.length === 0, dialogs.join('; ') || 'none');
check('no console errors', consoleErrors.length === 0, consoleErrors.join('; ') || 'none');
check('no page errors', pageErrors.length === 0, pageErrors.join('; ') || 'none');

writeFileSync(`${OUT}result.json`, JSON.stringify({ url: URL, checks, consoleErrors, pageErrors, dialogs }, null, 1));
await browser.close();

if (failures.length > 0) {
  console.log(`\ndocs-nav-check: ${failures.length} failure(s): ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\ndocs-nav-check: documentation and group navigation are wired');
