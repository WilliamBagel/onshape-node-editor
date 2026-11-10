#!/usr/bin/env node
// Context-menu / clipboard check (permanent harness, qa:context-copy).
//
// Drives the REAL app with Playwright mouse + keyboard and asserts the two
// behaviours of the #82 card:
//
//   menu   — a canvas right-click keeps the search bar + catalog categories,
//            a node right-click is Copy/Paste/Delete only, and every visible
//            row carries a sprite icon (clipboard rows also a keycap chip).
//   copy   — mouse-select a Chamfer, Ctrl+C then Ctrl+V creates a new node
//            with a fresh id at +24px; Copy/Paste/Delete rows in the menu are
//            the same actions. Two connected nodes copy/paste together and
//            keep the wire between them (remapped onto the new ids), and a
//            repeated Ctrl+V cascades further and adds another copy.
//
// The dev server is started on port 5231 if nothing is listening there, and
// stopped again on exit. Report + screenshots: tmp/qa-runs/context-copy/.
//
// Usage: pnpm qa:context-copy
//        QA_URL=http://127.0.0.1:5231/onshape-node-editor/ pnpm qa:context-copy
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.QA_URL ?? 'http://127.0.0.1:5231/onshape-node-editor/';
const PORT = '5231';
const OUT = 'tmp/qa-runs/context-copy/';
const OFFSET = 24;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(name, ok, detail = '') {
    const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
    console.log(line);
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
        server.kill('SIGTERM');
        server = null;
    }
};
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(130); });
process.on('SIGTERM', () => { shutdown(); process.exit(143); });

if (!(await reachable())) {
    console.log(`starting dev server on port ${PORT}…`);
    server = spawn('pnpm', ['exec', 'vite', '--port', PORT, '--host', '127.0.0.1', '--strictPort'], {
        cwd: process.cwd(),
        stdio: 'ignore',
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

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });

const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

/** Node ids + connections straight from the live editor (no re-implementation). */
const editorState = () => page.evaluate(() => {
    const editor = window.editor;
    return {
        nodes: editor.getNodes().map((node) => ({ id: node.id, title: node.getTitle?.() ?? '' })),
        connections: editor.getConnections().map((connection) => ({
            source: connection.source,
            sourceOutput: connection.sourceOutput,
            target: connection.target,
            targetInput: connection.targetInput,
        })),
    };
});

/** Visible title of one `.node` card, and its header box. */
const nodeCards = () => page.evaluate(() => [...document.querySelectorAll('.node')].map((element) => {
    const title = element.querySelector('.node-title');
    const box = element.getBoundingClientRect();
    const header = title?.getBoundingClientRect();
    return {
        title: (title?.textContent ?? '').trim(),
        selected: element.classList.contains('selected'),
        box: { x: box.left, y: box.top, width: box.width, height: box.height },
        header: header ? { x: header.left + header.width / 2, y: header.top + header.height / 2 } : null,
    };
}));

/** Bounding boxes of every card titled `Chamfer`, sorted left-to-right. */
const chamferBoxes = async () => (await nodeCards())
    .filter((card) => card.title === 'Chamfer')
    .map((card) => card.box)
    .sort((a, b) => a.x - b.x || a.y - b.y);

const sameBox = (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
const isNewBox = (candidate, known) => known.every((box) => !sameBox(box, candidate));

/** Read the open context menu (rows are `#context-menu-list > .block`). */
const readMenu = () => page.evaluate(() => {
    const menu = document.querySelector('.menu[rete-context-menu]');
    if (menu == null) return null;
    return {
        search: menu.querySelector('.search') != null,
        rows: [...menu.querySelectorAll('#context-menu-list > .block')].map((row) => ({
            label: (row.querySelector('.content')?.textContent ?? '').trim(),
            text: row.textContent.trim(),
            icon: row.querySelector('.row-icon svg use')?.getAttribute('href') ?? null,
            shortcut: row.querySelector('.row-shortcut')?.textContent?.trim() ?? null,
            hasSubitems: row.classList.contains('hasSubitems'),
        })),
    };
});

const closeMenu = async () => {
    await page.keyboard.press('Escape');
    for (let i = 0; i < 20; i += 1) {
        if ((await page.evaluate(() => document.querySelector('.menu[rete-context-menu]') == null))) break;
        await sleep(100);
    }
    await sleep(250);
};

const waitForSelected = async (count, timeoutMs = 2500) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const selected = (await nodeCards()).filter((card) => card.selected).length;
        if (selected === count) return selected;
        await sleep(100);
    }
    return (await nodeCards()).filter((card) => card.selected).length;
};

try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('.node').length >= 4, null, { timeout: 30000 });
    await sleep(1200);
    await shot('01-boot');

    const boot = await editorState();
    check('default graph loaded', boot.nodes.length >= 4, `${boot.nodes.length} nodes`);

    // ---- Canvas right-click: actions + search + catalog categories ----------
    const main = await page.evaluate(() => {
        const box = document.querySelector('main.rete').getBoundingClientRect();
        return { x: box.left, y: box.top, w: box.width, h: box.height };
    });
    await page.mouse.click(main.x + 700, main.y + 650, { button: 'right' });
    await sleep(700);
    const rootMenu = await readMenu();
    await shot('02-canvas-menu');
    check('canvas right-click opens the context menu', rootMenu != null);
    if (rootMenu != null) {
        const labels = rootMenu.rows.map((row) => row.label);
        check('canvas menu keeps the search bar', rootMenu.search);
        check('canvas menu lists Copy/Paste/Delete', ['Copy', 'Paste', 'Delete'].every((label) => labels.includes(label)), labels.slice(0, 6).join(', '));
        check('canvas menu lists catalog categories', rootMenu.rows.filter((row) => row.hasSubitems).length >= 3,
            `${rootMenu.rows.filter((row) => row.hasSubitems).length} categories`);
        const actionRows = rootMenu.rows.filter((row) => ['Copy', 'Paste', 'Delete'].includes(row.label));
        check('every canvas menu row renders an svg icon', rootMenu.rows.every((row) => row.icon != null),
            rootMenu.rows.filter((row) => row.icon == null).map((row) => row.label).join(', '));
        const copyRow = actionRows.find((row) => row.label === 'Copy');
        const pasteRow = actionRows.find((row) => row.label === 'Paste');
        check('Copy row shows a Ctrl+C shortcut chip', copyRow?.shortcut === 'Ctrl+C', copyRow?.shortcut ?? 'missing');
        check('Paste row shows a Ctrl+V shortcut chip', pasteRow?.shortcut === 'Ctrl+V', pasteRow?.shortcut ?? 'missing');
        check('Copy/Paste icons are the clipboard sprite icons',
            copyRow?.icon === '#svg-icon-copy-button' && pasteRow?.icon === '#svg-icon-paste-command',
            `${copyRow?.icon} / ${pasteRow?.icon}`);
    }
    await closeMenu();

    // ---- Node right-click: actions only ------------------------------------
    const firstChamfer = (await nodeCards()).find((card) => card.title === 'Chamfer');
    await page.mouse.click(firstChamfer.header.x, firstChamfer.header.y, { button: 'right' });
    await sleep(700);
    const nodeMenu = await readMenu();
    await shot('03-node-menu');
    check('node right-click opens the context menu', nodeMenu != null);
    if (nodeMenu != null) {
        const labels = nodeMenu.rows.map((row) => row.label);
        check('node menu is actions only', labels.length === 3 && ['Copy', 'Paste', 'Delete'].every((label, index) => labels[index] === label),
            labels.join(', '));
        check('node menu has no search bar', nodeMenu.search === false);
        check('node menu has no catalog categories', nodeMenu.rows.every((row) => row.hasSubitems === false));
        check('every node menu row renders an svg icon', nodeMenu.rows.every((row) => row.icon != null));
        check('node menu shows the Ctrl+C / Ctrl+V chips',
            nodeMenu.rows[0]?.shortcut === 'Ctrl+C' && nodeMenu.rows[1]?.shortcut === 'Ctrl+V',
            `${nodeMenu.rows[0]?.shortcut} / ${nodeMenu.rows[1]?.shortcut}`);
    }
    await closeMenu();

    // ---- Single-node copy/paste --------------------------------------------
    const beforeSingle = await editorState();
    const boxesBefore = await chamferBoxes();
    const cards = await nodeCards();
    const chamfer = cards.find((card) => card.title === 'Chamfer');
    await page.mouse.click(chamfer.header.x, chamfer.header.y);
    const selectedAfterClick = await waitForSelected(1);
    check('clicking a Chamfer header selects it', selectedAfterClick === 1, `${selectedAfterClick} selected`);

    await page.keyboard.press('Control+c');
    await sleep(300);
    await page.keyboard.press('Control+v');
    await sleep(1200);
    const afterSingle = await editorState();
    await shot('04-pasted-single');
    const added = afterSingle.nodes.filter((node) => !beforeSingle.nodes.some((old) => old.id === node.id));
    check('Ctrl+C / Ctrl+V adds exactly one node', afterSingle.nodes.length === beforeSingle.nodes.length + 1,
        `${beforeSingle.nodes.length} -> ${afterSingle.nodes.length}`);
    check('the pasted node is a Chamfer with a fresh id', added.length === 1 && added[0].title === 'Chamfer',
        added.map((node) => `${node.title}:${node.id}`).join(', '));

    // Node positions snap to the 20px canvas grid, so a +24px paste can land
    // 4-6px either side of the raw offset; it must still read as one cascade.
    const cascaded = (from, to) => to != null && Math.abs(to.x - from.x - OFFSET) <= 6 && Math.abs(to.y - from.y - OFFSET) <= 6;
    const boxesAfter = await chamferBoxes();
    const pastedBox = boxesAfter.find((box) => isNewBox(box, boxesBefore));
    const sourceBox = boxesBefore[0];
    check('the paste lands offset from the original', cascaded(sourceBox, pastedBox),
        pastedBox ? `dx=${Math.round(pastedBox.x - sourceBox.x)} dy=${Math.round(pastedBox.y - sourceBox.y)}` : 'no new box');

    // Repeated paste cascades further and adds another node.
    await page.keyboard.press('Control+v');
    await sleep(1200);
    const afterRepeat = await editorState();
    const boxesRepeat = await chamferBoxes();
    const secondBox = boxesRepeat.find((box) => isNewBox(box, [...boxesBefore, pastedBox]));
    check('a repeated Ctrl+V adds another node', afterRepeat.nodes.length === afterSingle.nodes.length + 1,
        `${afterSingle.nodes.length} -> ${afterRepeat.nodes.length}`);
    check('the repeated paste cascades a further offset', cascaded(pastedBox, secondBox),
        secondBox ? `dx=${Math.round(secondBox.x - pastedBox.x)} dy=${Math.round(secondBox.y - pastedBox.y)}` : 'no second box');

    // ----- Two connected nodes: wire must survive with the copies -----------
    await closeMenu();
    await page.mouse.click(main.x + 700, main.y + 650); // deselect (background)
    await sleep(300);

    const pair = await page.evaluate(() => {
        const center = (element) => {
            const box = element.getBoundingClientRect();
            return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        };
        const chamfers = [...document.querySelectorAll('.node')]
            .filter((element) => (element.querySelector('.node-title')?.textContent ?? '').trim() === 'Chamfer')
            .slice(0, 2);
        const header = (element) => center(element.querySelector('.node-title'));
        return {
            out: center(chamfers[0].querySelector('[data-testid="output-socket"]')),
            input: center(chamfers[1].querySelector('[data-testid="input-socket"]')),
            first: header(chamfers[0]),
            second: header(chamfers[1]),
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
    const wired = await editorState();
    check('a mouse-dragged wire connects the two Chamfers', wired.connections.length === 1,
        `${wired.connections.length} connection(s)`);

    await page.mouse.click(pair.first.x, pair.first.y);
    await sleep(250);
    await page.keyboard.down('Shift');
    await page.mouse.click(pair.second.x, pair.second.y);
    await page.keyboard.up('Shift');
    const selectedCount = await waitForSelected(2);
    check('Shift+click selects both connected nodes', selectedCount === 2, `${selectedCount} selected`);

    const beforePair = await editorState();
    await page.keyboard.press('Control+c');
    await sleep(300);
    await page.keyboard.press('Control+v');
    await sleep(1500);
    const afterPair = await editorState();
    await shot('05-pasted-pair');
    check('copying two connected nodes pastes both', afterPair.nodes.length === beforePair.nodes.length + 2,
        `${beforePair.nodes.length} -> ${afterPair.nodes.length}`);
    check('the internal wire is preserved on the copies', afterPair.connections.length === beforePair.connections.length + 1,
        `${beforePair.connections.length} -> ${afterPair.connections.length}`);
    const pastedIds = new Set(afterPair.nodes.filter((node) => !beforePair.nodes.some((old) => old.id === node.id)).map((node) => node.id));
    const newWires = afterPair.connections.filter((wire) => !beforePair.connections.some((old) => old.source === wire.source && old.target === wire.target));
    check('the preserved wire uses the fresh node ids',
        newWires.length === 1 && pastedIds.has(newWires[0].source) && pastedIds.has(newWires[0].target),
        newWires.map((wire) => `${wire.source}->${wire.target}`).join(', '));

    // Background click deselects without throwing (selector regression guard).
    await page.mouse.click(main.x + 700, main.y + 650);
    await sleep(300);

    // ---- The node menu's Delete row is wired to the same action -----------
    const beforeDelete = await editorState();
    const deleteTarget = (await nodeCards()).find((card) => card.title === 'Chamfer');
    await page.mouse.click(deleteTarget.header.x, deleteTarget.header.y, { button: 'right' });
    await sleep(700);
    await page.click('#cm-delete');
    await sleep(900);
    const afterDelete = await editorState();
    check('the node menu Delete row removes that node', afterDelete.nodes.length === beforeDelete.nodes.length - 1,
        `${beforeDelete.nodes.length} -> ${afterDelete.nodes.length}`);

    // ---- Health checks -----------------------------------------------------
    const finalState = await editorState();
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    const report = { ok: checks.every((item) => item.ok), checks, boot, final: finalState };
    writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));
    console.log(`\n${report.ok ? 'OK' : 'FAILED'} — ${checks.filter((item) => item.ok).length}/${checks.length} checks, ${finalState.nodes.length} nodes, ${finalState.connections.length} wire(s)`);
    await browser.close();
    shutdown();
    process.exit(report.ok ? 0 : 1);
} catch (error) {
    console.error('context-copy-check crashed:', error);
    writeFileSync(`${OUT}report.json`, JSON.stringify({ ok: false, checks, consoleErrors, pageErrors, crash: String(error?.stack ?? error) }, null, 2));
    await shot('99-crash').catch(() => {});
    await browser.close().catch(() => {});
    shutdown();
    process.exit(1);
}
