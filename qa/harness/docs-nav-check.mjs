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
//   7. The panel is a real inset sheet at 1600x1000, 1280x800 and 1024x768:
//      >= 8px of window on the top/right/bottom, the header title, close
//      button and section tabs fully inside the panel and never painted over
//      by the toolbar, and the article scrolling inside the panel.
//   8. No console errors, page errors or browser dialogs during the run.
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

// ── 7. Panel geometry: inset sheet, nothing clipped at the window top ──────
// The panel used to start at viewport y=0 behind the 36px toolbar (z-index
// 10000), so its header looked cut off. The contract below is layout, not
// pixels: a visible margin, a frame that clips, and a header that hit-tests
// to itself rather than to the toolbar.
const GEOMETRY_VIEWPORTS = [
  { width: 1600, height: 1000 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
];

const readPanelGeometry = () => page.evaluate(() => {
  const box = (el) => {
    const b = el.getBoundingClientRect();
    return { top: b.top, left: b.left, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
  };
  const panelEl = document.querySelector('.docs-panel');
  const panel = box(panelEl);
  const style = getComputedStyle(panelEl);
  const insidePanel = (r) => r.top >= panel.top - 0.5 && r.bottom <= panel.bottom + 0.5
    && r.left >= panel.left - 0.5 && r.right <= panel.right + 0.5;
  const insideViewport = (r) => r.top >= 0 && r.left >= 0
    && r.bottom <= window.innerHeight + 0.5 && r.right <= window.innerWidth + 0.5;
  // Hit-test the element's centre: if the toolbar (or anything else) painted
  // over it, elementFromPoint returns that element instead.
  const onTop = (el) => {
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return hit != null && (hit === el || el.contains(hit));
  };
  const title = document.querySelector('#docs-panel-title');
  const close = document.querySelector('.docs-close');
  const tabs = document.querySelector('.docs-sections');
  const tabButtons = [...document.querySelectorAll('.docs-section-tab')];
  const article = document.querySelector('.docs-article');
  const nav = document.querySelector('.docs-nav');
  const titleBox = box(title);
  const closeBox = box(close);
  const tabsBox = box(tabs);
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    panel,
    style: { borderRadius: style.borderTopLeftRadius, overflow: style.overflow, borderWidth: style.borderTopWidth },
    title: { ...titleBox, insidePanel: insidePanel(titleBox), insideViewport: insideViewport(titleBox), onTop: onTop(title) },
    close: { ...closeBox, insidePanel: insidePanel(closeBox), insideViewport: insideViewport(closeBox), onTop: onTop(close) },
    tabs: {
      ...tabsBox,
      insidePanel: insidePanel(tabsBox),
      insideViewport: insideViewport(tabsBox),
      onTop: onTop(tabs),
      buttonsVisible: tabButtons.every((tab) => {
        const b = tab.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.top >= panel.top && b.bottom <= panel.bottom && onTop(tab);
      }),
    },
    article: { ...box(article), insidePanel: insidePanel(box(article)), scrollHeight: article.scrollHeight, clientHeight: article.clientHeight },
    nav: { scrollHeight: nav.scrollHeight, clientHeight: nav.clientHeight },
  };
});

/** Scroll a container and report where it ended up, still inside the panel. */
const scrollArticle = () => page.evaluate(async () => {
  const article = document.querySelector('.docs-article');
  const panel = document.querySelector('.docs-panel').getBoundingClientRect();
  const before = article.scrollTop;
  const scrollHeight = article.scrollHeight;
  const clientHeight = article.clientHeight;
  article.scrollTop = Math.min(240, scrollHeight - clientHeight);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const after = article.getBoundingClientRect();
  return {
    title: document.querySelector('.docs-article-title')?.textContent?.trim() ?? '',
    before,
    scrollTop: article.scrollTop,
    scrollHeight,
    clientHeight,
    maxScroll: scrollHeight - clientHeight,
    top: after.top,
    bottom: after.bottom,
    panelTop: panel.top,
    panelBottom: panel.bottom,
  };
});

try {
  const help = page.locator('button[aria-label="Documentation"]');
  for (const viewport of GEOMETRY_VIEWPORTS) {
    const label = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await sleep(250);
    await help.click({ timeout: 5000 });
    await page.waitForSelector('.docs-panel', { timeout: 5000 });
    await sleep(250);
    const geometry = await readPanelGeometry();

    const margins = {
      top: geometry.panel.top,
      right: geometry.viewport.width - geometry.panel.right,
      bottom: geometry.viewport.height - geometry.panel.bottom,
      left: geometry.panel.left,
    };
    check(`[${label}] panel is inset from the window (top/right/bottom >= 8px)`,
      margins.top >= 8 && margins.right >= 8 && margins.bottom >= 8 && margins.left > 0,
      JSON.stringify(margins));
    check(`[${label}] panel still uses nearly full height`,
      geometry.panel.height >= geometry.viewport.height - 32,
      `panel=${geometry.panel.height} viewport=${geometry.viewport.height}`);
    check(`[${label}] panel is a rounded, hairline, clipping frame`,
      geometry.style.borderRadius === '6px' && geometry.style.overflow === 'hidden' && parseFloat(geometry.style.borderWidth) >= 1,
      JSON.stringify(geometry.style));
    check(`[${label}] header title and close button are fully inside the panel and viewport, above the toolbar`,
      geometry.title.insidePanel && geometry.title.insideViewport && geometry.title.onTop
        && geometry.close.insidePanel && geometry.close.insideViewport && geometry.close.onTop,
      JSON.stringify({ title: geometry.title, close: geometry.close }));
    check(`[${label}] section tabs are visible and not clipped`,
      geometry.tabs.insidePanel && geometry.tabs.insideViewport && geometry.tabs.onTop
        && geometry.tabs.buttonsVisible && geometry.tabs.height > 0,
      JSON.stringify(geometry.tabs));

    // A long node article proves the article pane owns the scroll, not the page.
    await page.fill('input.docs-search', 'extrude');
    await sleep(250);
    await page.locator('input.docs-search').press('Enter');
    await sleep(250);
    const scroll = await scrollArticle();
    check(`[${label}] article scrolls inside the panel`,
      geometry.article.insidePanel
        && scroll.title === 'Extrude'
        && scroll.scrollHeight > scroll.clientHeight + 20
        && scroll.scrollTop > 0 && scroll.scrollTop <= scroll.maxScroll
        && scroll.top >= scroll.panelTop && scroll.bottom <= scroll.panelBottom + 0.5,
      JSON.stringify({ article: geometry.article, scroll }));
    check(`[${label}] topic nav keeps its own scroll`,
      geometry.nav.scrollHeight > geometry.nav.clientHeight + 20,
      JSON.stringify(geometry.nav));

    await shot(`08-docs-geometry-${label}.png`);
    await page.locator('input.docs-search').press('Escape');
    await page.waitForSelector('.docs-panel', { state: 'detached', timeout: 5000 });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
} catch (error) {
  check('documentation panel geometry', false, error.message);
}

// ── 8. Errors ──────────────────────────────────────────────────────────────
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
