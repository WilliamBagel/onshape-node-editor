#!/usr/bin/env node
// Context-menu / clipboard UI audit (permanent harness, qa:context-menu-audit).
//
// Drives the REAL app in Chrome at 1600x1000, 1280x800 and 1024x768 and checks
// the #82 menu/clipboard card end to end:
//
//   placement — canvas menu at all four viewport edges plus centre: fully
//               inside the viewport, host box == menu box (no invisible strip),
//               no horizontal overflow, click just below the menu closes it.
//   rows      — sprite icon on every row, keycap chips track the live binding,
//               canvas menu (search + categories) vs node menu (actions only).
//   keyboard  — Arrow Up/Down/Home/End move aria-activedescendant, Escape
//               closes and returns focus to the canvas, Enter activates and
//               also returns focus; inline category leaves are reachable.
//   search    — leaf search inside categories, empty state, typing focus is
//               not hijacked by Ctrl+V/Backspace.
//   submenu   — an open category lays its leaves out as full-width rows below
//               the header (not a narrow flex column beside it) with the
//               chevron still on the header line.
//   clipboard — copy/paste single custom feature, multiple nodes with an
//               internal wire, repeated cascade, math-expression node, frame
//               and group-boundary skip, paste from an edge menu, selection.
//
// The dev server is started on port 5241 if nothing is listening there, and
// stopped again on exit. Report + screenshots: tmp/qa-runs/context-menu-audit/.
//
// Usage: pnpm qa:context-menu-audit
//        CONTEXT_MENU_AUDIT_URL=http://127.0.0.1:5241/onshape-node-editor/ pnpm qa:context-menu-audit
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.CONTEXT_MENU_AUDIT_URL ?? 'http://127.0.0.1:5241/onshape-node-editor/';
const PORT = '5241';
const OUT = 'tmp/qa-runs/context-menu-audit/';
const OFFSET = 24;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
function check(name, ok, detail = '') {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    checks.push({ name, ok: !!ok, detail: String(detail) });
    return ok;
}

mkdirSync(OUT, { recursive: true });

async function reachable() {
    try {
        const res = await fetch(URL, { method: 'GET' });
        return res.ok;
    } catch {
        return false;
    }
}

let server = null;
const shutdown = () => {
    if (server && server.exitCode == null && server.signalCode == null) {
        try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); }
        server = null;
    }
};
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(130); });
process.on('SIGTERM', () => { shutdown(); process.exit(143); });

async function startServer() {
    console.log(`starting dev server on port ${PORT} (cwd ${process.cwd()})…`);
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', PORT, '--host', '127.0.0.1', '--strictPort'], {
        cwd: process.cwd(),
        stdio: 'ignore',
        detached: true,
    });
    server.on('error', (err) => console.error('dev server failed:', err.message));
    let up = false;
    for (let i = 0; i < 80 && !up; i += 1) {
        await sleep(500);
        up = await reachable();
    }
    if (!up) {
        console.error(`FAIL  dev server did not become reachable at ${URL}`);
        shutdown();
        process.exit(1);
    }
}

const EXTERNAL_URL = process.env.CONTEXT_MENU_AUDIT_URL != null;

if (!EXTERNAL_URL) {
    // Always own 5241: stop any foreign listener (another checkout's server)
    // and start ours, so the audit can never run against different code.
    try { execFileSync('fuser', ['-k', `${PORT}/tcp`], { stdio: 'ignore' }); } catch { /* no listener */ }
    for (let i = 0; i < 40 && (await reachable()); i += 1) await sleep(250);
    await startServer();
} else {
    console.log(`auditing external server ${URL}`);
}

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox'],
});

const consoleErrors = [];
const pageErrors = [];
function watch(page) {
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    return page;
}

async function boot(page, width, height) {
    await page.setViewportSize({ width, height });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('.node').length >= 4, null, { timeout: 30000 });
    await sleep(900);
    return page.evaluate(() => {
        const box = document.querySelector('main.rete').getBoundingClientRect();
        return { x: box.left, y: box.top, w: box.width, h: box.height, vw: innerWidth, vh: innerHeight };
    });
}

const nodeCards = (page) => page.evaluate(() => [...document.querySelectorAll('.node')].map((element) => {
    const title = element.querySelector('.node-title');
    const box = element.getBoundingClientRect();
    const header = title?.getBoundingClientRect();
    return {
        title: (title?.textContent ?? '').trim(),
        selected: element.classList.contains('selected'),
        kind: element.className,
        box: { x: box.left, y: box.top, width: box.width, height: box.height },
        header: header ? { x: header.left + header.width / 2, y: header.top + header.height / 2 } : null,
    };
}));

const editorState = (page) => page.evaluate(() => {
    const editor = window.editor;
    return {
        nodes: editor.getNodes().map((node) => ({ id: node.id, title: node.getTitle?.() ?? '', kind: node.toJSON().kind, json: node.toJSON() })),
        connections: editor.getConnections().map((connection) => ({
            source: connection.source,
            sourceOutput: connection.sourceOutput,
            target: connection.target,
            targetInput: connection.targetInput,
        })),
    };
});

const readMenu = (page) => page.evaluate(() => {
    const menu = document.querySelector('.menu[rete-context-menu]');
    if (menu == null) return null;
    const rect = menu.getBoundingClientRect();
    const host = menu.parentElement.getBoundingClientRect();
    const list = menu.querySelector('#context-menu-list');
    return {
        search: menu.querySelector('.search') != null,
        focus: document.activeElement?.tagName + '.' + (document.activeElement?.className ?? ''),
        active: menu.getAttribute('aria-activedescendant'),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        host: { top: host.top, bottom: host.bottom, height: host.height },
        scroll: { width: menu.scrollWidth, clientWidth: menu.clientWidth, height: menu.scrollHeight, clientHeight: menu.clientHeight },
        listWidth: list?.getBoundingClientRect().width ?? 0,
        rows: [...menu.querySelectorAll('#context-menu-list > .block')].map((row) => {
            const content = row.querySelector('.content');
            const icon = row.querySelector('.row-icon svg use')?.getAttribute('href') ?? null;
            const chip = row.querySelector('.row-shortcut');
            const chevron = row.querySelector('.row-chevron');
            const chevronBox = chevron?.getBoundingClientRect();
            const rowBox = row.getBoundingClientRect();
            const subitems = [...row.querySelectorAll('.subitem')];
            return {
                label: (content?.textContent ?? '').trim(),
                icon,
                chip: chip?.textContent?.trim() ?? null,
                hasSubitems: row.classList.contains('hasSubitems'),
                chevron: chevron != null,
                chevronY: chevronBox ? chevronBox.top + chevronBox.height / 2 : null,
                rowTop: rowBox.top,
                rowHeight: rowBox.height,
                subitems: subitems.map((sub) => {
                    const subBox = sub.getBoundingClientRect();
                    return { label: (sub.querySelector('.content')?.textContent ?? '').trim(), width: subBox.width, top: subBox.top, height: subBox.height };
                }),
            };
        }),
    };
});

const closeMenu = async (page) => {
    await page.keyboard.press('Escape');
    for (let i = 0; i < 20; i += 1) {
        if (!(await page.evaluate(() => document.querySelector('.menu[rete-context-menu]') != null))) break;
        await sleep(80);
    }
    await sleep(150);
};

const openCanvasMenu = async (page, x, y) => {
    await page.mouse.click(x, y, { button: 'right' });
    for (let i = 0; i < 20; i += 1) {
        if (await page.evaluate(() => document.querySelector('.menu[rete-context-menu]') != null)) break;
        await sleep(80);
    }
    await sleep(250);
    return readMenu(page);
};

const selectedCount = (page) => page.evaluate(() => document.querySelectorAll('.node.selected').length);

try {
    const page = watch(await browser.newPage({ viewport: { width: 1600, height: 1000 } }));
    const main = await boot(page, 1600, 1000);
    await page.screenshot({ path: `${OUT}01-boot-1600.png` });
    const bootState = await editorState(page);
    check('default graph loaded', bootState.nodes.length >= 4, `${bootState.nodes.length} nodes`);

    // ---------------------------------------------------------------------
    // Placement at every edge, three viewport sizes.
    // ---------------------------------------------------------------------
    const sizes = [[1600, 1000], [1280, 800], [1024, 768]];
    for (const [width, height] of sizes) {
        if (width !== 1600) {
            await page.setViewportSize({ width, height });
            await sleep(400);
        }
        const area = await page.evaluate(() => {
            const box = document.querySelector('main.rete').getBoundingClientRect();
            return { x: box.left, y: box.top, w: box.width, h: box.height, vw: innerWidth, vh: innerHeight };
        });
        const points = {
            center: [area.x + Math.round(area.w / 2), area.y + Math.round(area.h / 2)],
            tl: [area.x + 3, area.y + 3],
            tr: [area.x + area.w - 3, area.y + 3],
            bl: [area.x + 3, area.y + area.h - 3],
            br: [area.x + area.w - 3, area.y + area.h - 3],
        };
        for (const [label, [x, y]] of Object.entries(points)) {
            const menu = await openCanvasMenu(page, x, y);
            const tag = `${width}x${height} ${label}`;
            if (menu == null) {
                check(`menu opens at ${tag}`, false, 'no menu');
                continue;
            }
            check(`menu opens with search at ${tag}`, menu.search === true, JSON.stringify(menu.rect));
            check(`menu stays inside ${width}x${height} at ${tag}`,
                menu.rect.left >= 0 && menu.rect.top >= 0 && menu.rect.right <= width - 4 && menu.rect.bottom <= height - 4,
                JSON.stringify(menu.rect));
            check(`host box matches menu box at ${tag}`,
                Math.abs(menu.host.height - menu.rect.height) <= 1,
                `host=${Math.round(menu.host.height)} menu=${Math.round(menu.rect.height)}`);
            check(`menu has no horizontal overflow at ${tag}`,
                menu.scroll.width <= menu.scroll.clientWidth,
                `${menu.scroll.width}/${menu.scroll.clientWidth}`);
            const topRows = menu.rows.slice(0, 3);
            check(`actions carry icon + live chip at ${tag}`,
                topRows.length === 3 && topRows.every((row) => row.icon != null) && topRows[0].chip === 'Ctrl+C' && topRows[1].chip === 'Ctrl+V' && topRows[2].chip === 'Del',
                JSON.stringify(topRows.map((row) => [row.label, row.icon, row.chip])));
            check(`every visible row carries an icon at ${tag}`,
                menu.rows.every((row) => row.icon != null),
                JSON.stringify(menu.rows.filter((row) => row.icon == null).map((row) => row.label)));
            await page.screenshot({ path: `${OUT}02-menu-${width}x${height}-${label}.png` });
            await closeMenu(page);
            check(`Escape closes and returns focus at ${tag}`,
                (await page.evaluate(() => document.activeElement?.tagName)) === 'MAIN',
                await page.evaluate(() => document.activeElement?.tagName));
        }

        if (width === 1024) {
            // The longest menu (category open) at the smallest viewport must
            // still fit and scroll, not spill sideways.
            await openCanvasMenu(page, area.x + area.w - 3, area.y + area.h - 3);
            await page.locator('#context-menu-list > .block', { hasText: /^Math$/ }).click();
            await sleep(400);
            const openMenu = await readMenu(page);
            const openRow = openMenu.rows.find((row) => row.hasSubitems && row.subitems.length > 0);
            check('open category stays inside 1024x768',
                openMenu.rect.bottom <= height - 4 && openMenu.rect.right <= width - 4 && openMenu.scroll.width <= openMenu.scroll.clientWidth,
                JSON.stringify(openMenu.rect));
            check('open category leaves stay full-width at 1024x768',
                openRow != null && openRow.subitems.every((sub) => sub.width >= 200),
                openRow ? `width=${Math.round(openRow.subitems[0]?.width ?? 0)}` : 'no row');
            await closeMenu(page);
        }
    }

    // Dead strip below the menu (regression: woolsthorpe .menu margin-bottom).
    await page.setViewportSize({ width: 1600, height: 1000 });
    await sleep(300);
    const centreMenu = await openCanvasMenu(page, 400, 250);
    const below = { x: centreMenu.rect.left + 40, y: centreMenu.rect.bottom + 12 };
    check('a click 12px below the menu is not swallowed', below.y < 1000, `y=${Math.round(below.y)}`);
    await page.mouse.click(below.x, below.y);
    await sleep(350);
    check('click below the menu closes it (no invisible host strip)',
        !(await page.evaluate(() => document.querySelector('.menu[rete-context-menu]') != null)),
        `host bottom ${Math.round(centreMenu.host.bottom)} vs menu bottom ${Math.round(centreMenu.rect.bottom)}`);

    // ---------------------------------------------------------------------
    // Node menu vs canvas menu, keyboard navigation.
    // ---------------------------------------------------------------------
    const chamfer = (await nodeCards(page)).find((card) => card.title === 'Chamfer');
    await page.mouse.click(chamfer.header.x, chamfer.header.y, { button: 'right' });
    await sleep(600);
    let menu = await readMenu(page);
    await page.screenshot({ path: `${OUT}03-node-menu.png` });
    check('node menu is actions only', menu.rows.map((row) => row.label).join('|') === 'Copy|Paste|Delete' && !menu.search,
        menu.rows.map((row) => row.label).join('|'));
    check('node menu root has menu roles', await page.evaluate(() => {
        const el = document.querySelector('[data-testid="context-menu"]');
        return el?.getAttribute('role') === 'menu' && el?.getAttribute('aria-activedescendant') === 'cm-copy';
    }));
    check('node menu focuses itself', menu.focus.startsWith('DIV'), menu.focus);
    await page.keyboard.press('ArrowDown');
    await sleep(120);
    menu = await readMenu(page);
    check('ArrowDown moves the active row', menu.active === 'cm-paste', String(menu.active));
    await page.keyboard.press('ArrowUp');
    await sleep(120);
    menu = await readMenu(page);
    check('ArrowUp moves back', menu.active === 'cm-copy', String(menu.active));
    await page.keyboard.press('Escape');
    await sleep(350);
    check('Escape returns focus to the canvas', (await page.evaluate(() => document.activeElement?.tagName)) === 'MAIN');
    // Enter on Copy: clipboard gets the node; focus must come back to canvas.
    await page.mouse.click(chamfer.header.x, chamfer.header.y, { button: 'right' });
    await sleep(500);
    await page.keyboard.press('Enter');
    await sleep(500);
    check('Enter activates and closes the menu', !(await page.evaluate(() => document.querySelector('.menu[rete-context-menu]') != null)));
    check('Enter returns focus to the canvas', (await page.evaluate(() => document.activeElement?.tagName)) === 'MAIN',
        await page.evaluate(() => document.activeElement?.tagName));
    const beforeEnterPaste = await editorState(page);
    await page.keyboard.press('Control+v');
    await sleep(900);
    const afterEnterPaste = await editorState(page);
    check('Enter on Copy actually copied (paste adds one)', afterEnterPaste.nodes.length === beforeEnterPaste.nodes.length + 1,
        `${beforeEnterPaste.nodes.length} -> ${afterEnterPaste.nodes.length}`);

    // Canvas menu keyboard: categories, inline leaves, Home/End.
    await page.mouse.click(700, 700);
    await sleep(250);
    const canvasMenu = await openCanvasMenu(page, 700, 700);
    check('canvas menu has search and categories', canvasMenu.search && canvasMenu.rows.filter((row) => row.hasSubitems).length >= 3,
        `${canvasMenu.rows.filter((row) => row.hasSubitems).length} categories`);
    check('category rows show a chevron', canvasMenu.rows.filter((row) => row.hasSubitems).length >= 3 &&
        canvasMenu.rows.filter((row) => row.hasSubitems).every((row) => row.chevron));
    const baseStyle = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#context-menu-list > .block')];
        return {
            activeShadow: getComputedStyle(rows[0]).boxShadow,
            pasteBg: getComputedStyle(rows[1]).backgroundColor,
            searchOutline: getComputedStyle(document.querySelector('.menu .search')).outlineStyle,
        };
    });
    await page.locator('#context-menu-list > .block').nth(1).hover();
    await sleep(150);
    const hoverBg = await page.evaluate(() => getComputedStyle(document.querySelectorAll('#context-menu-list > .block')[1]).backgroundColor);
    check('active row has the steel keyline', baseStyle.activeShadow.includes('inset'), baseStyle.activeShadow);
    check('hover tints a row', hoverBg !== baseStyle.pasteBg, `${baseStyle.pasteBg} -> ${hoverBg}`);
    check('focused search has a visible outline', baseStyle.searchOutline !== 'none', baseStyle.searchOutline);
    await page.keyboard.press('End');
    await sleep(120);
    const endActive = (await readMenu(page)).active;
    await page.keyboard.press('Home');
    await sleep(120);
    const homeActive = (await readMenu(page)).active;
    check('End/Home jump to last/first row', endActive !== homeActive && homeActive === 'cm-copy', `${homeActive} / ${endActive}`);
    // Open the first category inline, walk into a leaf, activate with Enter.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await sleep(150);
    const catActive = (await readMenu(page)).active;
    await page.keyboard.press('Enter');
    await sleep(400);
    menu = await readMenu(page);
    const openRow = menu.rows.find((row) => row.hasSubitems && row.subitems.length > 0);
    check('Enter opens a category inline', openRow != null && openRow.subitems.length > 0,
        `${catActive} -> ${openRow?.label ?? 'none'}`);
    check('inline leaves are full-width rows below the header',
        openRow != null && openRow.subitems.length > 0 &&
        openRow.subitems.every((sub) => sub.width >= 200 && sub.top >= openRow.rowTop + 24),
        openRow ? `width=${Math.round(openRow.subitems[0]?.width ?? 0)} top=${Math.round(openRow.subitems[0]?.top ?? 0)} header=${Math.round(openRow.rowTop)}` : 'no row');
    check('chevron stays on the header line when open',
        openRow != null && openRow.chevronY != null && openRow.chevronY < (openRow.subitems[0]?.top ?? Infinity),
        openRow ? `chevron=${Math.round(openRow.chevronY)} firstLeaf=${Math.round(openRow.subitems[0]?.top ?? 0)}` : 'no row');
    await page.screenshot({ path: `${OUT}04-category-open.png` });
    const beforeLeaf = await editorState(page);
    await page.keyboard.press('ArrowDown');
    await sleep(150);
    await page.keyboard.press('Enter');
    await sleep(900);
    const afterLeaf = await editorState(page);
    check('Enter on an inline leaf inserts it and closes', afterLeaf.nodes.length === beforeLeaf.nodes.length + 1 &&
        !(await page.evaluate(() => document.querySelector('.menu[rete-context-menu]') != null)),
        `${beforeLeaf.nodes.length} -> ${afterLeaf.nodes.length}`);

    // Mouse path: category click, then leaf click, must insert too.
    await page.mouse.click(1200, 700);
    await sleep(250);
    await openCanvasMenu(page, 1200, 700);
    await page.locator('#context-menu-list > .block', { hasText: /^Math$/ }).click();
    await sleep(350);
    const beforeClickLeaf = await editorState(page);
    const leafCount = await page.locator('.subitem').count();
    await page.locator('.subitem').first().click();
    await sleep(1100);
    const afterClickLeaf = await editorState(page);
    check('clicking a catalog leaf inserts it', leafCount > 0 && afterClickLeaf.nodes.length === beforeClickLeaf.nodes.length + 1,
        `${beforeClickLeaf.nodes.length} -> ${afterClickLeaf.nodes.length} (${leafCount} leaves)`);

    // ---------------------------------------------------------------------
    // Search: leaves inside categories, empty state, typing focus.
    // ---------------------------------------------------------------------
    await page.mouse.click(300, 850);
    await sleep(250);
    await openCanvasMenu(page, 300, 850);
    await page.locator('.menu .search').fill('fillet');
    await sleep(500);
    const hits = await page.evaluate(() => [...document.querySelectorAll('#context-menu-list > .block')].map((row) => ({
        label: row.querySelector('.hit-label')?.textContent ?? '',
        category: row.querySelector('.hit-category')?.textContent ?? '',
    })));
    check('search finds a leaf inside a category', hits.some((hit) => hit.label.toLowerCase().includes('fillet')) && hits.every((hit) => hit.category !== ''),
        JSON.stringify(hits.slice(0, 3)));
    await page.locator('.menu .search').fill('not-a-node');
    await sleep(400);
    const emptyText = await page.evaluate(() => document.querySelector('.menu .menu-empty')?.textContent ?? '');
    check('empty search reports no match', emptyText.includes('No matching node'), emptyText);
    await page.keyboard.press('Enter');
    await sleep(200);
    check('Enter on an empty result leaves the menu open', await page.evaluate(() => document.querySelector('.menu[rete-context-menu]') != null));

    // Focus in the search field must edit text and never paste nodes.
    const beforeTyping = await editorState(page);
    const search = page.locator('.menu .search');
    await search.fill('');
    await search.type('chamfer');
    await page.keyboard.press('Backspace');
    const typed = await search.inputValue();
    await page.keyboard.press('Control+v');
    await sleep(700);
    const afterTyping = await editorState(page);
    check('typing and Backspace edit the search text', typed === 'chamfe', typed);
    check('Ctrl+V in the search field does not paste nodes', afterTyping.nodes.length === beforeTyping.nodes.length,
        `${beforeTyping.nodes.length} -> ${afterTyping.nodes.length}`);
    check('search keeps focus while typing', await page.evaluate(() => document.activeElement?.className === 'search'));
    await page.keyboard.press('Escape');
    await sleep(300);

    // ---------------------------------------------------------------------
    // Clipboard: single custom feature, cascade, multiple + wire, math.
    // ---------------------------------------------------------------------
    const single = (await nodeCards(page)).find((card) => card.title === 'Chamfer');
    await page.mouse.click(single.header.x, single.header.y);
    await sleep(250);
    const beforeSingle = await editorState(page);
    await page.keyboard.press('Control+c');
    await sleep(250);
    await page.keyboard.press('Control+v');
    await sleep(1000);
    const afterSingle = await editorState(page);
    const addedSingle = afterSingle.nodes.filter((node) => !beforeSingle.nodes.some((old) => old.id === node.id));
    check('Ctrl+C/Ctrl+V adds exactly one node', afterSingle.nodes.length === beforeSingle.nodes.length + 1,
        `${beforeSingle.nodes.length} -> ${afterSingle.nodes.length}`);
    const sourceSpec = beforeSingle.nodes.find((node) => node.kind === 'CustomFeature')?.json.parameters;
    check('the copy is a CustomFeature with a fresh id and the same spec',
        addedSingle.length === 1 && addedSingle[0].kind === 'CustomFeature' &&
        JSON.stringify(addedSingle[0].json.parameters) === JSON.stringify(sourceSpec),
        addedSingle.map((node) => `${node.kind}:${node.id}`).join(', '));
    const cascaded = (from, to) => to != null && Math.abs(to.x - from.x - OFFSET) <= 6 && Math.abs(to.y - from.y - OFFSET) <= 6;
    const selectedBox = () => page.evaluate(() => {
        const element = document.querySelector('.node.selected');
        if (element == null) return null;
        const box = element.getBoundingClientRect();
        return { x: box.left, y: box.top, width: box.width, height: box.height };
    });
    const pastedBox = await selectedBox();
    check('paste lands +24px from the original', cascaded(single.box, pastedBox),
        pastedBox ? `dx=${Math.round(pastedBox.x - single.box.x)} dy=${Math.round(pastedBox.y - single.box.y)}` : 'no selected box');
    await page.keyboard.press('Control+v');
    await sleep(1000);
    const afterRepeat = await editorState(page);
    const secondBox = await selectedBox();
    check('a repeated Ctrl+V adds another node', afterRepeat.nodes.length === afterSingle.nodes.length + 1,
        `${afterSingle.nodes.length} -> ${afterRepeat.nodes.length}`);
    check('the repeated paste cascades further', cascaded(pastedBox, secondBox),
        secondBox ? `dx=${Math.round(secondBox.x - pastedBox.x)} dy=${Math.round(secondBox.y - pastedBox.y)}` : 'no second box');
    check('pasted nodes are left selected', (await selectedCount(page)) === 1, `${await selectedCount(page)} selected`);

    // Multi-select + internal wire (mouse-dragged).
    await page.keyboard.press('Escape');
    await page.mouse.click(400, 700);
    await sleep(250);
    const pair = await page.evaluate(() => {
        const center = (element) => { const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; };
        const chamfers = [...document.querySelectorAll('.node')]
            .filter((element) => (element.querySelector('.node-title')?.textContent ?? '').trim() === 'Chamfer')
            .slice(0, 2);
        return {
            out: center(chamfers[0].querySelector('[data-testid="output-socket"]')),
            input: center(chamfers[1].querySelector('[data-testid="input-socket"]')),
            first: center(chamfers[0].querySelector('.node-title')),
            second: center(chamfers[1].querySelector('.node-title')),
        };
    });
    await page.mouse.move(pair.out.x, pair.out.y);
    await page.mouse.down();
    await page.mouse.move((pair.out.x + pair.input.x) / 2, pair.out.y, { steps: 10 });
    await sleep(250);
    await page.mouse.move(pair.input.x, pair.input.y, { steps: 40 });
    await sleep(400);
    await page.mouse.up();
    await sleep(700);
    const wired = await editorState(page);
    check('a mouse-dragged wire connects two Chamfers', wired.connections.length >= 1, `${wired.connections.length} connection(s)`);
    await page.mouse.click(pair.first.x, pair.first.y);
    await sleep(200);
    await page.keyboard.down('Shift');
    await page.mouse.click(pair.second.x, pair.second.y);
    await page.keyboard.up('Shift');
    await sleep(350);
    const beforePair = await editorState(page);
    await page.keyboard.press('Control+c');
    await sleep(250);
    await page.keyboard.press('Control+v');
    await sleep(1200);
    const afterPair = await editorState(page);
    check('copying two connected nodes pastes both', afterPair.nodes.length === beforePair.nodes.length + 2,
        `${beforePair.nodes.length} -> ${afterPair.nodes.length}`);
    check('the internal wire is preserved on the copies', afterPair.connections.length === beforePair.connections.length + 1,
        `${beforePair.connections.length} -> ${afterPair.connections.length}`);
    const pastedIds = new Set(afterPair.nodes.filter((node) => !beforePair.nodes.some((old) => old.id === node.id)).map((node) => node.id));
    const newWires = afterPair.connections.filter((wire) => !beforePair.connections.some((old) => old.source === wire.source && old.target === wire.target));
    check('the preserved wire uses fresh ids',
        newWires.length === 1 && pastedIds.has(newWires[0].source) && pastedIds.has(newWires[0].target),
        newWires.map((wire) => `${wire.source}->${wire.target}`).join(', '));
    check('both pasted nodes are selected', (await selectedCount(page)) === 2, `${await selectedCount(page)} selected`);

    // Math-expression node.
    await page.keyboard.press('Escape');
    await page.keyboard.press('F3');
    await sleep(500);
    await page.locator('input.actions-search').fill('math expression');
    await sleep(350);
    await page.locator('#action-palette-list .actions-item').first().click();
    await sleep(900);
    const mathBox = await page.evaluate(() => { const box = document.querySelector('.math-node')?.getBoundingClientRect(); return box ? { x: box.left + box.width / 2, y: box.top + 12 } : null; });
    check('math expression node can be inserted', mathBox != null);
    if (mathBox != null) {
        await page.mouse.click(mathBox.x, mathBox.y);
        await sleep(300);
        const beforeMath = await editorState(page);
        const sourceMath = beforeMath.nodes.find((node) => node.kind === 'math-expression');
        await page.keyboard.press('Control+c');
        await sleep(250);
        await page.keyboard.press('Control+v');
        await sleep(1000);
        const afterMath = await editorState(page);
        const pastedMath = afterMath.nodes.find((node) => node.kind === 'math-expression' && !beforeMath.nodes.some((old) => old.id === node.id));
        check('copy/paste duplicates a math-expression node', afterMath.nodes.length === beforeMath.nodes.length + 1,
            `${beforeMath.nodes.length} -> ${afterMath.nodes.length}`);
        check('the math copy keeps its source', pastedMath != null && pastedMath.json.source === sourceMath.json.source,
            pastedMath ? JSON.stringify(pastedMath.json.source) : 'no pasted math node');
    }

    // Paste from a menu opened at the bottom-right edge.
    await page.mouse.click(400, 700);
    await sleep(200);
    const edgeMenu = await openCanvasMenu(page, main.x + main.w - 3, main.y + main.h - 3);
    const beforeEdgePaste = await editorState(page);
    const pasteRow = page.locator('#context-menu-list > .block').filter({ has: page.locator('.content', { hasText: /^Paste$/ }) }).first();
    await pasteRow.click();
    await sleep(1000);
    const afterEdgePaste = await editorState(page);
    check('menu Paste at the bottom-right edge pastes a node', afterEdgePaste.nodes.length === beforeEdgePaste.nodes.length + 1,
        `${beforeEdgePaste.nodes.length} -> ${afterEdgePaste.nodes.length}`);
    check('edge menu paste leaves the new node selected', (await selectedCount(page)) === 1, `${await selectedCount(page)} selected`);
    check('edge menu was fully inside the viewport', edgeMenu != null && edgeMenu.rect.bottom <= 1000 - 4 && edgeMenu.rect.right <= 1600 - 4,
        edgeMenu ? JSON.stringify(edgeMenu.rect) : 'no menu');

    // Undo after paste: reported, not implemented anywhere in the app.
    const undo = await page.evaluate(() => ({
        editorUndo: typeof window.editor.undo,
        history: Object.keys(window.editor).filter((key) => /undo|redo|history/i.test(key)),
        dialog: !!document.querySelector('[data-testid="undo"]'),
    }));
    const undoAbsent = undo.editorUndo === 'undefined' && undo.history.length === 0 && !undo.dialog;
    console.log(`${undoAbsent ? 'INFO' : 'NOTE'}  undo after paste is ${undoAbsent ? 'absent (reported)' : 'present'} — ${JSON.stringify(undo)}`);

    // ---------------------------------------------------------------------
    // Frame and group-boundary behaviour on a fresh editor (empty clipboard).
    // ---------------------------------------------------------------------
    const framePage = watch(await browser.newPage({ viewport: { width: 1600, height: 1000 } }));
    await boot(framePage, 1600, 1000);
    const emptyState = await editorState(framePage);
    await framePage.keyboard.press('Control+c');
    await framePage.keyboard.press('Control+v');
    await sleep(600);
    check('copy/paste with an empty clipboard is a no-op', (await editorState(framePage)).nodes.length === emptyState.nodes.length,
        `${emptyState.nodes.length} nodes`);
    await openCanvasMenu(framePage, 700, 700);
    await framePage.locator('#context-menu-list > .block').filter({ has: framePage.locator('.content', { hasText: /^Paste$/ }) }).first().click();
    await sleep(600);
    check('menu Paste with an empty clipboard is a no-op', (await editorState(framePage)).nodes.length === emptyState.nodes.length &&
        !(await framePage.evaluate(() => document.querySelector('.menu[rete-context-menu]') != null)),
        `${emptyState.nodes.length} nodes`);
    const chamfers = (await nodeCards(framePage)).filter((card) => card.title === 'Chamfer');
    await framePage.mouse.click(chamfers[0].header.x, chamfers[0].header.y);
    await framePage.keyboard.down('Shift');
    await framePage.mouse.click(chamfers[1].header.x, chamfers[1].header.y);
    await framePage.keyboard.up('Shift');
    await sleep(300);
    await framePage.keyboard.press('Control+g');
    await sleep(1000);
    const framed = await editorState(framePage);
    check('Ctrl+G wraps the selection in a frame', framed.nodes.some((node) => node.kind === 'frame'), framed.nodes.map((node) => node.kind).join(','));
    const frameHit = await framePage.evaluate(() => {
        const frame = [...document.querySelectorAll('.node')].find((element) => element.classList.contains('frame-node'));
        if (frame == null) return null;
        const box = frame.getBoundingClientRect();
        return { x: box.left + 30, y: box.top + 12 };
    });
    if (frameHit != null) {
        await framePage.mouse.click(frameHit.x, frameHit.y);
        await sleep(300);
        const beforeFrame = await editorState(framePage);
        await framePage.keyboard.press('Control+c');
        await sleep(250);
        await framePage.keyboard.press('Control+v');
        await sleep(900);
        const afterFrame = await editorState(framePage);
        check('copy/paste of a frame alone adds nothing', afterFrame.nodes.length === beforeFrame.nodes.length,
            `${beforeFrame.nodes.length} -> ${afterFrame.nodes.length}`);
    }

    // Group boundary card: not copyable, paste must not duplicate it.
    const groupPage = watch(await browser.newPage({ viewport: { width: 1600, height: 1000 } }));
    await boot(groupPage, 1600, 1000);
    const groupChamfers = (await nodeCards(groupPage)).filter((card) => card.title === 'Chamfer');
    await groupPage.mouse.click(groupChamfers[0].header.x, groupChamfers[0].header.y);
    await groupPage.keyboard.down('Shift');
    await groupPage.mouse.click(groupChamfers[1].header.x, groupChamfers[1].header.y);
    await groupPage.keyboard.up('Shift');
    await sleep(300);
    await groupPage.keyboard.press('Control+Shift+G');
    await sleep(1200);
    const groupCard = await groupPage.evaluate(() => {
        const card = [...document.querySelectorAll('.node')].find((element) => /Group/.test(element.textContent ?? ''));
        if (card == null) return null;
        const box = card.getBoundingClientRect();
        return { x: box.left + 30, y: box.top + 30 };
    });
    check('Ctrl+Shift+G creates a group instance', groupCard != null);
    if (groupCard != null) {
        await groupPage.mouse.click(groupCard.x, groupCard.y);
        await sleep(300);
        await groupPage.keyboard.press('Tab');
        await sleep(1200);
        const inGroup = await editorState(groupPage);
        check('Tab enters the group and shows boundary cards', inGroup.nodes.some((node) => node.kind === 'group-input') && inGroup.nodes.some((node) => node.kind === 'group-output'),
            inGroup.nodes.map((node) => node.kind).join(','));
        const boundaryHit = await groupPage.evaluate(() => {
            const card = [...document.querySelectorAll('.node')].find((element) => (element.textContent ?? '').includes('Start Feature'));
            if (card == null) return null;
            const box = card.getBoundingClientRect();
            return { x: box.left + 30, y: box.top + 14 };
        });
        if (boundaryHit != null) {
            await groupPage.mouse.click(boundaryHit.x, boundaryHit.y, { button: 'right' });
            await sleep(500);
            const boundaryMenu = await readMenu(groupPage);
            check('boundary card menu is actions only', boundaryMenu != null && boundaryMenu.rows.map((row) => row.label).join('|') === 'Copy|Paste|Delete',
                boundaryMenu?.rows.map((row) => row.label).join('|') ?? 'no menu');
            const beforeBoundary = await editorState(groupPage);
            await groupPage.keyboard.press('Enter'); // Copy
            await sleep(300);
            await groupPage.keyboard.press('Control+v');
            await sleep(900);
            const afterBoundary = await editorState(groupPage);
            check('copy/paste of a group boundary adds nothing', afterBoundary.nodes.length === beforeBoundary.nodes.length,
                `${beforeBoundary.nodes.length} -> ${afterBoundary.nodes.length}`);
        }
    }

    // ---------------------------------------------------------------------
    // Live bindings: chips and Alt+C/Alt+V actually work.
    // ---------------------------------------------------------------------
    const bindingsContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await bindingsContext.addInitScript(() => {
        localStorage.setItem('onshape-node-editor:editor-settings', JSON.stringify({
            preferences: {},
            bindings: { copy: 'Alt+C', paste: 'Alt+V' },
        }));
    });
    const bindingsPage = watch(await bindingsContext.newPage());
    await boot(bindingsPage, 1600, 1000);
    const customMenu = await openCanvasMenu(bindingsPage, 400, 250);
    check('shortcut chips follow live bindings', customMenu.rows[0].chip === 'Alt+C' && customMenu.rows[1].chip === 'Alt+V',
        JSON.stringify(customMenu.rows.slice(0, 2).map((row) => row.chip)));
    await closeMenu(bindingsPage);
    const customChamfer = (await nodeCards(bindingsPage)).find((card) => card.title === 'Chamfer');
    await bindingsPage.mouse.click(customChamfer.header.x, customChamfer.header.y);
    await sleep(250);
    const beforeAlt = await editorState(bindingsPage);
    await bindingsPage.keyboard.press('Alt+c');
    await sleep(250);
    await bindingsPage.keyboard.press('Alt+v');
    await sleep(900);
    const afterAlt = await editorState(bindingsPage);
    check('Alt+C/Alt+V copy and paste', afterAlt.nodes.length === beforeAlt.nodes.length + 1,
        `${beforeAlt.nodes.length} -> ${afterAlt.nodes.length}`);
    await bindingsContext.close();

    // ---------------------------------------------------------------------
    // Health.
    // ---------------------------------------------------------------------
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    const report = {
        ok: checks.every((item) => item.ok),
        checks,
        undo: { present: !undoAbsent, detail: undo },
        final: await editorState(page),
    };
    writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));
    console.log(`\n${report.ok ? 'OK' : 'FAILED'} — ${checks.filter((item) => item.ok).length}/${checks.length} checks, ${report.final.nodes.length} nodes, ${report.final.connections.length} wire(s)`);
    await browser.close();
    shutdown();
    process.exit(report.ok ? 0 : 1);
} catch (error) {
    console.error('context-menu-audit crashed:', error);
    writeFileSync(`${OUT}report.json`, JSON.stringify({ ok: false, checks, consoleErrors, pageErrors, crash: String(error?.stack ?? error) }, null, 2));
    await browser.close().catch(() => {});
    shutdown();
    process.exit(1);
}
