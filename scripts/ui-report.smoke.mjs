#!/usr/bin/env node
/**
 * Smoke test for the generated dashboard (file://, real clicks/typing).
 * Usage: node scripts/ui-report.smoke.mjs [--dashboard <path>]
 * Prints PASS/FAIL lines; exits non-zero on failure.
 * Screenshot: tmp/dashboard-fix/smoke.png
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
let dashboardPath = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dashboard') dashboardPath = argv[++i];
  else if (!argv[i].startsWith('--') && !dashboardPath) dashboardPath = argv[i];
}
dashboardPath = dashboardPath
  ? path.resolve(dashboardPath)
  : path.resolve(process.cwd(), 'tmp/dashboard-fix/dashboard.html');

const shotPath = path.join(path.dirname(dashboardPath), 'smoke.png');
const fileUrl = 'file://' + dashboardPath.replace(/^\//, '/');

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS ${name}${detail ? ' — ' + detail : ''}`);
  else { console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}

async function visibleCount(page) {
  return page.evaluate(() => [...document.querySelectorAll('.card[data-severity]')].filter((c) => !c.hidden).length);
}

async function resultText(page) {
  return (await page.locator('#result-count').textContent())?.trim() ?? '';
}

async function main() {
  if (!existsSync(dashboardPath)) {
    console.log(`FAIL dashboard missing: ${dashboardPath}`);
    process.exit(1);
  }
  console.log(`INFO dashboard: ${dashboardPath}`);
  const exec = '/usr/bin/google-chrome-stable';
  const browser = await chromium.launch({
    executablePath: existsSync(exec) ? exec : '/opt/google/chrome/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', (e) => console.log(`INFO pageerror: ${e.message}`));
  await page.goto(fileUrl);

  await check('initial 4 cards', (await visibleCount(page)) === 4, `count=${await visibleCount(page)}`);
  await check('initial count text', (await resultText(page)) === 'Showing 4 of 4 issues', await resultText(page));
  await check('task section visible', await page.locator('.task').isVisible());
  await check('no broken placeholder images', (await page.evaluate(() => [...document.querySelectorAll('.card img')].filter((im) => im.complete && im.naturalWidth === 0).length)) === 0);

  // High filter
  await page.locator('[data-filter-group="severity"][data-filter-value="high"]').click();
  await check('high filter shows 2', (await visibleCount(page)) === 2, `count=${await visibleCount(page)}`);
  await check('high count text', (await resultText(page)) === 'Showing 2 of 4 issues', await resultText(page));
  // toggle active chip off (repeat click clears group)
  await page.locator('[data-filter-group="severity"][data-filter-value="high"]').click();
  await check('high toggle-off restores 4', (await visibleCount(page)) === 4, `count=${await visibleCount(page)}`);
  // All chip path
  await page.locator('[data-filter-group="severity"][data-filter-value="high"]').click();
  await page.locator('[data-filter-group="severity"][data-filter-value="all"]').click();
  await check('severity All restores 4', (await visibleCount(page)) === 4, `count=${await visibleCount(page)}`);
  await check('severity All aria-pressed', (await page.locator('[data-filter-group="severity"][data-filter-value="all"]').getAttribute('aria-pressed')) === 'true');
  // Category Accessibility
  await page.locator('[data-filter-group="category"][data-filter-value="accessibility"]').click();
  await check('accessibility filter shows 1', (await visibleCount(page)) === 1, `count=${await visibleCount(page)}`);
  await check('task section still visible after filter', await page.locator('.task').isVisible());
  await page.locator('#clear-all').click();
  await check('clear all restores 4', (await visibleCount(page)) === 4, `count=${await visibleCount(page)}`);

  // Search: match
  await page.locator('#q').fill('fillet');
  await check('search fillet shows 1', (await visibleCount(page)) === 1, `count=${await visibleCount(page)}`);
  await check('search count text', (await resultText(page)) === 'Showing 1 of 4 issues', await resultText(page));
  await check('clear-q visible when non-empty', await page.locator('#clear-q').isVisible());
  // No-match
  await page.locator('#q').fill('zzz-no-match-xyz');
  await check('no-match shows 0', (await visibleCount(page)) === 0, `count=${await visibleCount(page)}`);
  await check('no-match message visible', await page.locator('#no-match').isVisible());
  await check('no-match count text', (await resultText(page)) === 'Showing 0 of 4 issues', await resultText(page));
  await page.locator('#clear-filters').click();
  await check('clear-filters in empty state restores 4', (await visibleCount(page)) === 4, `count=${await visibleCount(page)}`);

  // Clear x button
  await page.locator('#q').fill('fillet');
  await page.locator('#clear-q').click();
  await check('clear-q restores 4', (await visibleCount(page)) === 4, `count=${await visibleCount(page)}`);
  await check('search empty after clear-q', (await page.locator('#q').inputValue()) === '');

  // Escape clears search
  await page.locator('#q').fill('fillet');
  await page.locator('#q').press('Escape');
  await check('escape restores 4', (await visibleCount(page)) === 4, `count=${await visibleCount(page)}`);
  await check('search empty after escape', (await page.locator('#q').inputValue()) === '');

  // Combined severity + search
  await page.locator('[data-filter-group="severity"][data-filter-value="high"]').click();
  await page.locator('#q').fill('fillet');
  await check('combined high+fillet shows 1', (await visibleCount(page)) === 1, `count=${await visibleCount(page)}`);
  await page.locator('#clear-all').click();
  await check('clear all after combined restores 4', (await visibleCount(page)) === 4, `count=${await visibleCount(page)}`);
  await check('search empty after clear all', (await page.locator('#q').inputValue()) === '');
  await check('severity All pressed after clear all', (await page.locator('[data-filter-group="severity"][data-filter-value="all"]').getAttribute('aria-pressed')) === 'true');

  // Button sizes >=24px tall and visible
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.chip, #q, #clear-q, .search input')].map((el) => ({ id: el.id || el.textContent.trim() || el.className, h: el.getBoundingClientRect().height, visible: !el.hidden && el.offsetParent !== null })));
  const bad = sizes.filter((s) => s.visible && s.h < 24);
  await check('buttons/controls >=24px', bad.length === 0, JSON.stringify(sizes));
  // summary counts stay totals
  const totalStat = await page.locator('.card-stat').first().textContent();
  await check('summary stays total (4)', totalStat.trim().startsWith('4'), totalStat.trim());

  await page.screenshot({ path: shotPath });
  console.log(`INFO screenshot: ${shotPath}`);
  await browser.close();
  console.log(failures ? `SUMMARY FAIL (${failures})` : 'SUMMARY PASS');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('SMOKE ERROR', e); process.exit(1); });
