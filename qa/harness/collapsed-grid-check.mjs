#!/usr/bin/env node
// Collapsed-node socket grid check (permanent harness, qa:collapsed-grid).
//
// A collapsed node lays its sockets out in a grid of at most three rows.
// Inputs fill top-to-bottom and overflow into columns to the RIGHT of the
// input block; outputs fill top-to-bottom and overflow into columns to the
// LEFT of the output block. The card may grow horizontally but never past
// three socket rows + padding vertically, and every socket stays a live rete
// port, so wires must still terminate at socket centres after collapsing.
//
// This harness drives the real app (default debug graph: two 7-input Chamfers
// plus a 5-output Define Feature node), creates a real wire by mouse drag,
// collapses both ends, and measures rendered geometry. It FAILS on:
//   - more than 3 socket rows on a collapsed side
//   - inputs that do not overflow rightwards (or outputs leftwards)
//   - an overflow column that does not start at its top row
//   - clipped sockets / horizontal scroll on the collapsed card
//   - a collapsed strip taller than 3 rows + gaps + padding
//   - a wire endpoint farther than 5px from the nearest socket centre
//
// The dev server is started on port 5222 if nothing is listening there, and
// stopped again on exit. Report + screenshots: tmp/qa-runs/collapsed-grid/.
//
// Usage: pnpm qa:collapsed-grid
//        QA_URL=http://127.0.0.1:5222/onshape-node-editor/ pnpm qa:collapsed-grid
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.QA_URL ?? 'http://127.0.0.1:5222/onshape-node-editor/';
const PORT = '5222';
const OUT = 'tmp/qa-runs/collapsed-grid/';
const MAX_ROWS = 3;
const ROW_HEIGHT = 14;
const ROW_GAP = 2;
const STRIP_PADDING = 6; // 2px top + 4px bottom
const TOLERANCE = 1;
const WIRE_TOLERANCE = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const checks = [];
function check(name, ok, detail = '') {
    const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`;
    console.log(line);
    checks.push({ name, ok: !!ok, detail: String(detail) });
    if (!ok) failures.push(name);
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

try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('.node').length >= 4, null, { timeout: 30000 });
    await sleep(1200);
    await shot('01-expanded');

    // Shared measuring helper (no eval): group -> rows/columns/socket boxes.
    await page.evaluate(() => {
        const clusters = (values) => {
            const sorted = [...values].sort((a, b) => a - b);
            const out = [];
            for (const v of sorted) {
                const last = out[out.length - 1];
                if (last == null || v - last.end > 2) out.push({ start: v, end: v, values: [v] });
                else { last.end = v; last.values.push(v); }
            }
            return out.map((c) => c.values.reduce((a, b) => a + b, 0) / c.values.length);
        };
        window.__qaMeasureGroup = (el) => {
            if (!el) return null;
            const children = [...el.children].map((child) => {
                const r = child.getBoundingClientRect();
                return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
            });
            const rowCenters = clusters(children.map((c) => c.cy));
            const colCenters = clusters(children.map((c) => c.cx));
            const columns = colCenters.map((x) => {
                const inCol = children
                    .filter((c) => Math.abs(c.cx - x) <= 2)
                    .sort((a, b) => a.cy - b.cy);
                return { x, ys: inCol.map((c) => c.cy), count: inCol.length };
            });
            // Report columns in DOM order (the order auto-placement used):
            // inputs accrete left-to-right, outputs right-to-left, so the
            // direction assertions below can read like the visual contract.
            const firstIndex = (x) => children.findIndex((c) => Math.abs(c.cx - x) <= 2);
            columns.sort((a, b) => firstIndex(a.x) - firstIndex(b.x));
            const rect = el.getBoundingClientRect();
            return {
                display: getComputedStyle(el).display,
                direction: getComputedStyle(el).direction,
                gridTemplateRows: getComputedStyle(el).gridTemplateRows,
                gridAutoFlow: getComputedStyle(el).gridAutoFlow,
                count: children.length,
                rows: rowCenters.length,
                rowCenters,
                colCenters,
                columns,
                children,
                rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
            };
        };
    });

    // --- create a real wire: Define Feature "entities" output -> Chamfer input
    const pair = await page.evaluate(() => {
        const center = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const outs = [...document.querySelectorAll('[data-testid="output-socket"]')].map((el) => ({
            ...center(el),
            label: el.closest('.output')?.querySelector('.output-title')?.textContent?.trim() ?? '',
            node: el.closest('.node')?.querySelector('.node-title')?.textContent?.trim() ?? '',
        }));
        const ins = [...document.querySelectorAll('[data-testid="input-socket"]')].map((el) => ({
            ...center(el),
            label: el.parentElement?.parentElement?.textContent?.slice(0, 60)?.trim() ?? '',
            node: el.closest('.node')?.querySelector('.node-title')?.textContent?.trim() ?? '',
        }));
        const out = outs.find((s) => s.label === 'entities' && s.node === 'My New Feature');
        const inp = ins.find((s) => /Entities to chamfer/.test(s.label) && s.node === 'Chamfer');
        return { out, inp };
    });
    if (!pair.out || !pair.inp) throw new Error(`no wire socket pair found: ${JSON.stringify(pair)}`);

    await page.mouse.move(pair.out.x, pair.out.y);
    await page.mouse.down();
    await page.mouse.move((pair.out.x + pair.inp.x) / 2, pair.out.y, { steps: 10 });
    await sleep(250);
    await page.mouse.move(pair.inp.x, pair.inp.y, { steps: 40 });
    await sleep(350);
    await page.mouse.up();
    await sleep(800);
    const connectionCount = await page.evaluate(() => document.querySelectorAll('[data-testid="connection"]').length);
    if (!check('created a wire into the Chamfer', connectionCount >= 1, `${connectionCount} connection(s)`)) {
        throw new Error('wire drag did not create a connection');
    }

    // --- collapse the Chamfer that received the wire (locate by its toggle box)
    const chamferToggle = await page.evaluate((target) => {
        const center = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const nodes = [...document.querySelectorAll('.node')].filter(
            (n) => n.querySelector('.node-title')?.textContent?.trim() === 'Chamfer',
        );
        let best = null;
        for (const node of nodes) {
            for (const socket of node.querySelectorAll('[data-testid="input-socket"]')) {
                const c = center(socket);
                const d = Math.hypot(c.x - target.x, c.y - target.y);
                if (best == null || d < best.d) best = { d, node };
            }
        }
        if (best == null) return null;
        return {
            ...center(best.node.querySelector('.node-collapse-toggle')),
            nodeIndex: nodes.indexOf(best.node),
            nodeWidth: best.node.getBoundingClientRect().width,
        };
    }, pair.inp);
    await page.mouse.click(chamferToggle.x, chamferToggle.y);
    await sleep(900);
    await shot('02-chamfer-collapsed');

    const chamfer = await page.evaluate(() => {
        const measureGroup = window.__qaMeasureGroup;
        const node = [...document.querySelectorAll('.node')].find(
            (n) => n.classList.contains('collapsed') && n.querySelector('.node-title')?.textContent?.trim() === 'Chamfer',
        );
        if (!node) return null;
        const strip = node.querySelector('[data-testid="collapsed-socket-strip"]');
        const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        };
        const stripRect = rect(strip);
        const inputs = measureGroup(strip.querySelector('.collapsed-socket-inputs'));
        const outputs = measureGroup(strip.querySelector('.collapsed-socket-outputs'));
        return {
            card: rect(node),
            strip: stripRect,
            stripStyle: {
                paddingTop: getComputedStyle(strip).paddingTop,
                paddingBottom: getComputedStyle(strip).paddingBottom,
                flexWrap: getComputedStyle(strip).flexWrap,
            },
            cardScrollWidth: node.scrollWidth,
            cardClientWidth: node.clientWidth,
            stripScrollWidth: strip.scrollWidth,
            stripClientWidth: strip.clientWidth,
            inputs,
            outputs,
            inputSockets: [...strip.querySelectorAll('[data-testid="collapsed-input-socket"]')].map(rect),
            outputSockets: [...strip.querySelectorAll('[data-testid="collapsed-output-socket"]')].map(rect),
        };
    });

    if (!check('a Chamfer collapsed with >3 input sockets', chamfer != null && chamfer.inputs.count > 3, `${chamfer?.inputs.count} inputs`)) {
        throw new Error('collapsed Chamfer not found');
    }
    check('collapsed inputs form a grid', chamfer.inputs.display === 'grid', chamfer.inputs.display);
    check(
        'collapsed card keeps the expanded width as its floor',
        chamfer.card.width + TOLERANCE >= chamferToggle.nodeWidth,
        `${chamfer.card.width}px >= ${chamferToggle.nodeWidth}px`,
    );
    check('collapsed input rows <= 3', chamfer.inputs.rows <= MAX_ROWS, `${chamfer.inputs.rows} rows`);
    check('collapsed inputs overflow into a new column', chamfer.inputs.columns.length >= 2, `${chamfer.inputs.columns.length} columns`);
    check(
        'input overflow columns run left-to-right',
        chamfer.inputs.columns.length >= 2 &&
            chamfer.inputs.columns.every((col, i, all) => i === 0 || col.x > all[i - 1].x + TOLERANCE),
        JSON.stringify(chamfer.inputs.columns.map((c) => Math.round(c.x))),
    );
    check(
        'every input column starts at the top row',
        chamfer.inputs.columns.every(
            (col) => Math.abs(Math.min(...col.ys) - Math.min(...chamfer.inputs.rowCenters)) <= TOLERANCE,
        ),
        JSON.stringify(chamfer.inputs.columns.map((c) => Math.round(Math.min(...c.ys)))),
    );
    check(
        'collapsed strip stays within 3 rows + padding',
        chamfer.strip.height <= MAX_ROWS * ROW_HEIGHT + (MAX_ROWS - 1) * ROW_GAP + STRIP_PADDING + TOLERANCE,
        `strip ${chamfer.strip.height}px, limit ${MAX_ROWS * ROW_HEIGHT + (MAX_ROWS - 1) * ROW_GAP + STRIP_PADDING}px`,
    );
    check(
        'no socket is clipped by the strip or the card',
        [...chamfer.inputSockets, ...chamfer.outputSockets].every((s) => {
            const inside = (outer) =>
                s.left >= outer.left - TOLERANCE &&
                s.top >= outer.top - TOLERANCE &&
                s.right <= outer.right + TOLERANCE &&
                s.bottom <= outer.bottom + TOLERANCE;
            return inside(chamfer.strip) && inside(chamfer.card);
        }),
        `${chamfer.inputSockets.length + chamfer.outputSockets.length} sockets measured`,
    );
    check(
        'collapsed card has no hidden horizontal overflow',
        chamfer.cardScrollWidth <= chamfer.cardClientWidth + TOLERANCE,
        `scrollWidth ${chamfer.cardScrollWidth} vs clientWidth ${chamfer.cardClientWidth}`,
    );
    check(
        'collapsed strip has no hidden horizontal overflow',
        chamfer.stripScrollWidth <= chamfer.stripClientWidth + TOLERANCE,
        `scrollWidth ${chamfer.stripScrollWidth} vs clientWidth ${chamfer.stripClientWidth}`,
    );
    check('Chamfer output block declares leftward overflow', chamfer.outputs?.direction === 'rtl', chamfer.outputs?.direction);

    // --- collapse the 5-output Define Feature node to exercise output overflow
    const outToggle = await page.evaluate(() => {
        const node = [...document.querySelectorAll('.node')].find(
            (n) => n.querySelector('.node-title')?.textContent?.trim() === 'My New Feature',
        );
        if (!node) return null;
        const r = node.querySelector('.node-collapse-toggle').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!check('found the 5-output node', outToggle != null, 'My New Feature')) {
        throw new Error('5-output node not found');
    }
    await page.mouse.click(outToggle.x, outToggle.y);
    await sleep(900);
    await shot('03-outputs-collapsed');

    const outputNode = await page.evaluate(() => {
        const measureGroup = window.__qaMeasureGroup;
        const node = [...document.querySelectorAll('.node')].find(
            (n) => n.classList.contains('collapsed') && n.querySelector('.node-title')?.textContent?.trim() === 'My New Feature',
        );
        if (!node) return null;
        const strip = node.querySelector('[data-testid="collapsed-socket-strip"]');
        const outputs = measureGroup(strip.querySelector('.collapsed-socket-outputs'));
        const r = node.getBoundingClientRect();
        return {
            card: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
            outputs,
            outputSockets: [...strip.querySelectorAll('[data-testid="collapsed-output-socket"]')].map((el) => {
                const b = el.getBoundingClientRect();
                return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
            }),
            strip: (() => {
                const b = strip.getBoundingClientRect();
                return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, height: b.height };
            })(),
        };
    });

    if (!check('a node with >3 outputs collapsed', outputNode != null && outputNode.outputs.count > 3, `${outputNode?.outputs.count} outputs`)) {
        throw new Error('collapsed output node not found');
    }
    check('collapsed output rows <= 3', outputNode.outputs.rows <= MAX_ROWS, `${outputNode.outputs.rows} rows`);
    check('collapsed outputs overflow into a new column', outputNode.outputs.columns.length >= 2, `${outputNode.outputs.columns.length} columns`);
    check(
        'output overflow columns run right-to-left',
        outputNode.outputs.columns.length >= 2 &&
            outputNode.outputs.columns.every((col, i, all) => i === 0 || col.x < all[i - 1].x - TOLERANCE),
        JSON.stringify(outputNode.outputs.columns.map((c) => Math.round(c.x))),
    );
    check(
        'every output column starts at the top row',
        outputNode.outputs.columns.every(
            (col) => Math.abs(Math.min(...col.ys) - Math.min(...outputNode.outputs.rowCenters)) <= TOLERANCE,
        ),
        JSON.stringify(outputNode.outputs.columns.map((c) => Math.round(Math.min(...c.ys)))),
    );
    check(
        'output sockets are not clipped by the card',
        outputNode.outputSockets.every(
            (s) =>
                s.left >= outputNode.card.left - TOLERANCE &&
                s.top >= outputNode.card.top - TOLERANCE &&
                s.right <= outputNode.card.right + TOLERANCE &&
                s.bottom <= outputNode.card.bottom + TOLERANCE,
        ),
        `${outputNode.outputSockets.length} sockets measured`,
    );
    check(
        'output card stays within 3 rows + padding',
        outputNode.strip.height <= MAX_ROWS * ROW_HEIGHT + (MAX_ROWS - 1) * ROW_GAP + STRIP_PADDING + TOLERANCE,
        `strip ${outputNode.strip.height}px`,
    );

    // --- wires must still end at the live collapsed socket centres
    const wires = await page.evaluate(() => {
        const center = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const outSockets = [
            ...document.querySelectorAll('[data-testid="output-socket"], [data-testid="collapsed-output-socket"]'),
        ].map(center);
        const inSockets = [
            ...document.querySelectorAll('[data-testid="input-socket"], [data-testid="collapsed-input-socket"]'),
        ].map(center);
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const nearest = (p, list) => Math.min(...list.map((q) => dist(p, q)));
        return [...document.querySelectorAll('[data-testid="connection"] path.path')].map((path) => {
            const d = path.getAttribute('d') ?? '';
            const nums = [...d.matchAll(/-?\d+\.?\d*/g)].map((m) => Number(m[0]));
            const m = path.getScreenCTM ? path.getScreenCTM() : path.getCTM();
            const start = new DOMPoint(nums[0], nums[1]).matrixTransform(m);
            const end = new DOMPoint(nums[nums.length - 2], nums[nums.length - 1]).matrixTransform(m);
            return {
                startErr: nearest(start, outSockets),
                endErr: nearest(end, inSockets),
            };
        });
    });
    check('wire still exists after collapsing both ends', wires.length >= 1, `${wires.length} wire(s)`);
    const maxStartErr = Math.max(0, ...wires.map((w) => w.startErr));
    const maxEndErr = Math.max(0, ...wires.map((w) => w.endErr));
    check(
        'wire output endpoint stays on a socket centre',
        maxStartErr <= WIRE_TOLERANCE,
        `${maxStartErr.toFixed(2)}px <= ${WIRE_TOLERANCE}px`,
    );
    check(
        'wire input endpoint stays on a socket centre',
        maxEndErr <= WIRE_TOLERANCE,
        `${maxEndErr.toFixed(2)}px <= ${WIRE_TOLERANCE}px`,
    );

    // --- expand back: collapsed layout must not have disturbed the card
    const chamferToggle2 = await page.evaluate(() => {
        const node = [...document.querySelectorAll('.node')].find(
            (n) => n.classList.contains('collapsed') && n.querySelector('.node-title')?.textContent?.trim() === 'Chamfer',
        );
        if (!node) return null;
        const r = node.querySelector('.node-collapse-toggle').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(chamferToggle2.x, chamferToggle2.y);
    await sleep(800);
    const expanded = await page.evaluate(() => {
        const node = [...document.querySelectorAll('.node')].find(
            (n) => !n.classList.contains('collapsed') && n.querySelector('.node-title')?.textContent?.trim() === 'Chamfer',
        );
        const strip = node?.querySelector('[data-testid="collapsed-socket-strip"]');
        const style = node ? getComputedStyle(node) : null;
        return {
            width: node?.getBoundingClientRect().width ?? 0,
            inlineWidth: node?.getAttribute('style') ?? '',
            maxWidth: style?.maxWidth ?? '',
            stripGone: strip == null && node?.querySelector('[data-testid="input-socket"]') != null,
        };
    });
    check('expanding restores the expanded layout', expanded.stripGone && expanded.width > 0, JSON.stringify(expanded));

    writeFileSync(
        `${OUT}results.json`,
        JSON.stringify(
            {
                url: URL,
                measurements: { chamfer, outputNode, wires, expanded },
                checks,
                failures,
            },
            null,
            2,
        ),
    );
    console.log(JSON.stringify({ checks: checks.length, failed: failures, outputs: outputNode.outputs, inputs: chamfer.inputs }, null, 2));
} catch (error) {
    failures.push(`harness error: ${error.message}`);
    console.error('COLLAPSED-GRID ERROR:', error.stack ?? error.message);
    try {
        await shot('99-error');
    } catch {
        /* page may be closed */
    }
} finally {
    await browser.close().catch(() => {});
    shutdown();
}

if (failures.length > 0) {
    console.error(`COLLAPSED-GRID FAIL: ${failures.join(' | ')}`);
    process.exitCode = 1;
} else {
    console.log('COLLAPSED-GRID PASS');
}
