#!/usr/bin/env node
// Math expression field check (permanent harness, qa:math-field).
//
// The math node's field is one representation (Blender-style): idle shows the
// typeset formula, clicking swaps in the editable source in the same box, and
// Enter re-typesets. This harness drives the real app end to end:
//
//   1. open the real Add-node palette (Shift+A), search "math", insert
//      "Math expression" — no test hooks, no direct node creation;
//   2. click the field, type `sqrt(x^2 + y^2) / PI`, press Enter, and assert
//      the field itself renders a KaTeX sqrt and fraction;
//   3. assert there is no separate `.math-preview` block below the field;
//   4. click the rendered field and assert the source text is actually
//      visible: the highlight layer carries the text, its contrast against
//      the field surface is >= 4.5:1, the caret is visible, and the
//      highlight box overlaps the textarea;
//   5. press Enter and assert the formula is typeset again in the same field;
//   6. fail on any console error / page error.
//
// Dev server: port 5232 (strictPort), started if nothing is listening and
// stopped on exit. Report + screenshots: tmp/qa-runs/math-field/.
//
// Usage: pnpm qa:math-field
//        QA_URL=http://127.0.0.1:5232/onshape-node-editor/ pnpm qa:math-field
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.QA_URL ?? 'http://127.0.0.1:5232/onshape-node-editor/';
const PORT = '5232';
const OUT = 'tmp/qa-runs/math-field/';
const EXPRESSION = 'sqrt(x^2 + y^2) / PI';

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

if (process.env.QA_URL != null) {
    // An explicit server (e.g. one started by hand for debugging) is used
    // as-is, but it must be reachable.
    if (!(await reachable())) {
        console.error(`FAIL  QA_URL is not reachable: ${URL}`);
        process.exit(1);
    }
} else {
    // Own port 5232: a server left by another worktree would serve a
    // different build, so reclaim the port before starting ours.
    try {
        execFileSync('fuser', ['-k', `${PORT}/tcp`], { stdio: 'ignore' });
    } catch {
        // Nothing listening (or fuser unavailable): the spawn below reports
        // a real failure.
    }
    for (let i = 0; i < 20 && (await reachable()); i += 1) await sleep(250);

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
page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

/** Read the math field's state and computed colours from the live page. */
const readField = () =>
    page.evaluate(() => {
        const parse = (value) => {
            const m = /rgba?\(([^)]+)\)/.exec(value ?? '');
            if (!m) return null;
            const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
            return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
        };
        const luminance = ({ r, g, b }) => {
            const channel = (v) => {
                const s = v / 255;
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };
        const contrast = (fg, bg) => {
            if (fg == null || bg == null) return 0;
            const l1 = luminance(fg);
            const l2 = luminance(bg);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        };
        const background = (el) => {
            for (let cur = el; cur != null; cur = cur.parentElement) {
                const parsed = parse(getComputedStyle(cur).backgroundColor);
                if (parsed != null && parsed.a > 0.5) return parsed;
            }
            return parse(getComputedStyle(document.body).backgroundColor);
        };

        const field = document.querySelector('[data-testid="math-field"]');
        const node = document.querySelector('[data-testid="math-expression-node"]');
        if (field == null || node == null) return null;
        const source = field.querySelector('[data-testid="math-field-source"]');
        const highlight = field.querySelector('[data-testid="math-field-highlight"]');
        const idle = field.querySelector('[data-testid="math-field-rendered"]');
        const bg = background(field);
        const highlightStyle = highlight ? getComputedStyle(highlight) : null;
        const sourceStyle = source ? getComputedStyle(source) : null;
        const highlightRect = highlight?.getBoundingClientRect();
        const sourceRect = source?.getBoundingClientRect();

        return {
            hasField: true,
            previews: document.querySelectorAll('.math-preview').length,
            katex: field.querySelectorAll('.katex').length,
            sqrt: field.querySelectorAll('.katex .sqrt').length,
            frac: field.querySelectorAll('.katex .mfrac').length,
            editing: source != null,
            sourceValue: source?.value ?? null,
            sourceLabel: source?.getAttribute('aria-label') ?? null,
            highlightText: highlight?.textContent?.trim() ?? null,
            highlightTokens: highlight?.querySelectorAll('span[class^="tok-"]').length ?? 0,
            highlightColor: highlightStyle?.color ?? null,
            highlightRatio: highlightStyle ? contrast(parse(highlightStyle.color), bg) : 0,
            background: bg,
            sourceColor: sourceStyle?.color ?? null,
            caretColor: sourceStyle?.caretColor ?? null,
            selectionBackground: source
                ? getComputedStyle(source, '::selection').backgroundColor
                : null,
            highlightRect: highlightRect
                ? { left: highlightRect.left, top: highlightRect.top, width: highlightRect.width, height: highlightRect.height }
                : null,
            sourceRect: sourceRect
                ? { left: sourceRect.left, top: sourceRect.top, width: sourceRect.width, height: sourceRect.height }
                : null,
            idleLabel: idle?.getAttribute('aria-label') ?? null,
            focusedTestId: document.activeElement?.getAttribute?.('data-testid') ?? null,
            nodeWidth: node.getBoundingClientRect().width,
            nodeRight: node.getBoundingClientRect().right,
            fieldRight: field.getBoundingClientRect().right,
            fieldWidth: field.getBoundingClientRect().width,
        };
    });

try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('.node').length > 0, null, { timeout: 30000 });
    await sleep(800);
    await shot('01-canvas');

    // 1. Real palette: Shift+A → search → click "Math expression".
    await page.keyboard.press('Escape');
    await page.mouse.click(700, 500);
    await page.keyboard.press('Shift+A');
    const palette = page.locator('.palette[role="dialog"]');
    await palette.waitFor({ state: 'visible', timeout: 10000 });
    const search = page.locator('.palette-search');
    await search.fill('math');
    const item = page.locator('.palette-item', { hasText: 'Math expression' }).first();
    await item.waitFor({ state: 'visible', timeout: 5000 });
    check('palette lists "Math expression"', (await item.count()) > 0, await item.innerText().catch(() => ''));
    await item.click();
    await palette.waitFor({ state: 'hidden', timeout: 10000 });

    const mathNode = page.locator('[data-testid="math-expression-node"]').first();
    await mathNode.waitFor({ state: 'visible', timeout: 10000 });
    check('math node created through the real palette', (await mathNode.count()) === 1);
    await shot('02-node-added');

    // 2. Click the field, type the expression, commit with Enter.
    await page.locator('[data-testid="math-field-rendered"]').first().click();
    const source = page.locator('[data-testid="math-field-source"]').first();
    await source.waitFor({ state: 'visible', timeout: 5000 });
    await source.fill(EXPRESSION);
    await page.keyboard.press('Enter');
    await sleep(400);

    let state = await readField();
    check('rendered field shows a KaTeX formula after Enter', state != null && state.katex > 0, JSON.stringify({ katex: state?.katex }));
    check('rendered field contains a KaTeX square root', state != null && state.sqrt > 0, `sqrt=${state?.sqrt}`);
    check('rendered field contains a KaTeX fraction', state != null && state.frac > 0, `frac=${state?.frac}`);
    check('no separate .math-preview block below the field', state != null && state.previews === 0, `found=${state?.previews}`);
    check('editing ended and the field is typeset again', state != null && !state.editing, JSON.stringify({ editing: state?.editing }));
    check('idle field is labelled with the source', state?.idleLabel?.includes(EXPRESSION) === true, state?.idleLabel ?? '');
    check('focus returned to the rendered field after Enter', state?.focusedTestId === 'math-field-rendered', state?.focusedTestId ?? '');
    const widthAfterRender = state?.nodeWidth ?? 0;
    check(
        'node card has a non-zero width and contains the field',
        (state?.nodeWidth ?? 0) > 150 && (state?.fieldWidth ?? 0) > 0 && (state?.fieldRight ?? 0) <= (state?.nodeRight ?? -1) + 1,
        JSON.stringify({ node: state?.nodeWidth, field: state?.fieldWidth, fieldRight: state?.fieldRight, nodeRight: state?.nodeRight }),
    );
    await shot('03-rendered');

    // 3. Click the rendered formula and prove the source text is visible.
    await page.locator('[data-testid="math-field-rendered"]').first().click();
    await page.locator('[data-testid="math-field-source"]').first().waitFor({ state: 'visible', timeout: 5000 });
    await sleep(200);

    state = await readField();
    check('click replaces the formula with the source in the same field', state != null && state.editing, JSON.stringify({ editing: state?.editing }));
    check('textarea holds the committed expression', state?.sourceValue === EXPRESSION, state?.sourceValue ?? 'null');
    check('highlight layer paints the same text (not empty)', state?.highlightText === EXPRESSION, state?.highlightText ?? 'null');
    check('syntax highlighting emitted token spans', (state?.highlightTokens ?? 0) >= 5, `tokens=${state?.highlightTokens}`);
    check(
        'source text has readable contrast (>= 4.5:1)',
        (state?.highlightRatio ?? 0) >= 4.5,
        `ratio=${state?.highlightRatio?.toFixed(2)} color=${state?.highlightColor}`,
    );
    check(
        'caret is visible (caret-color not transparent)',
        state?.caretColor != null && state.caretColor !== 'rgba(0, 0, 0, 0)' && state.caretColor !== 'transparent',
        state?.caretColor ?? 'null',
    );
    check(
        'highlight box aligns with the textarea',
        state?.highlightRect != null &&
            state.sourceRect != null &&
            Math.abs(state.highlightRect.left - state.sourceRect.left) <= 2 &&
            Math.abs(state.highlightRect.height - state.sourceRect.height) <= 4,
        JSON.stringify({ highlight: state?.highlightRect, source: state?.sourceRect }),
    );
    check(
        'textarea text is transparent so only the highlight layer shows (no double print)',
        state?.sourceColor === 'rgba(0, 0, 0, 0)',
        state?.sourceColor ?? 'null',
    );
    check('textarea keeps its accessibility label', state?.sourceLabel?.includes('Math expression source') === true, state?.sourceLabel ?? '');
    check('editing does not resize the node card', Math.abs((state?.nodeWidth ?? 0) - widthAfterRender) <= 1, JSON.stringify({ before: widthAfterRender, editing: state?.nodeWidth }));
    await shot('04-editing');

    // 4. Enter re-renders in place.
    await page.keyboard.press('Enter');
    await sleep(400);
    state = await readField();
    check('Enter re-typesets the formula in the same field', state != null && state.katex > 0 && !state.editing, JSON.stringify({ katex: state?.katex, editing: state?.editing }));
    check('fraction and sqrt survive the edit round-trip', (state?.frac ?? 0) > 0 && (state?.sqrt ?? 0) > 0, JSON.stringify({ frac: state?.frac, sqrt: state?.sqrt }));
    check('still no separate .math-preview block', state != null && state.previews === 0, `found=${state?.previews}`);
    check('render round-trip leaves the node size unchanged', Math.abs((state?.nodeWidth ?? 0) - widthAfterRender) <= 1, JSON.stringify({ before: widthAfterRender, after: state?.nodeWidth }));
    await shot('05-rendered-again');

    // 6. Wave-2 node chrome: the return port is at the node's top-right (the
    //    Onshape position), the title uses the 14px/700 sans title scale, the
    //    port survives collapse, and a connected quantity producer retypes
    //    the return socket instead of leaving it 'unknown'.
    const nodeChrome = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="math-expression-node"]');
        if (node == null) return null;
        const rect = node.getBoundingClientRect();
        const socketHost = node.querySelector('[data-testid="math-return-socket"]');
        const socketEl = socketHost?.querySelector('.socket') ?? socketHost;
        const socket = socketEl?.getBoundingClientRect();
        const field = node.querySelector('[data-testid="math-field"]')?.getBoundingClientRect();
        const rows = [...node.querySelectorAll('.math-socket-row')].map((el) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        });
        const label = node.querySelector('.math-output-label');
        const readFont = (el) => {
            if (el == null) return null;
            const cs = getComputedStyle(el);
            return { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight };
        };
        return {
            node: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
            socket: socket ? { left: socket.left, top: socket.top, right: socket.right, bottom: socket.bottom, cx: socket.left + socket.width / 2, cy: socket.top + socket.height / 2 } : null,
            field: field ? { top: field.top, bottom: field.bottom, left: field.left, right: field.right } : null,
            rows,
            label: label?.textContent?.trim() ?? null,
            mathTitle: readFont(document.querySelector('[data-testid="math-title"]')),
            normalTitle: readFont(document.querySelector('.node .ns-dialog-title')),
        };
    });
    const socketNearRight = nodeChrome?.socket != null &&
        Math.abs(nodeChrome.socket.right - nodeChrome.node.right) <= 8;
    check(
        'return socket hugs the node\'s right edge',
        socketNearRight,
        JSON.stringify({ socketRight: nodeChrome?.socket?.right, nodeRight: nodeChrome?.node?.right }),
    );
    check(
        'return socket is in the top-right (above the formula field)',
        nodeChrome?.socket != null && nodeChrome.field != null &&
            nodeChrome.socket.bottom <= nodeChrome.field.top + 1 &&
            nodeChrome.socket.top - nodeChrome.node.top <= 60,
        JSON.stringify({ offsetTop: nodeChrome?.socket != null ? nodeChrome.socket.top - nodeChrome.node.top : null, socketBottom: nodeChrome?.socket?.bottom, fieldTop: nodeChrome?.field?.top }),
    );
    check('return socket label reads "return"', nodeChrome?.label === 'return', nodeChrome?.label ?? 'null');
    check(
        'input socket rows sit below the field and do not overlap it',
        nodeChrome != null && nodeChrome.field != null && nodeChrome.rows.length > 0 &&
            nodeChrome.rows.every((r) => r.top >= nodeChrome.field.bottom - 1),
        JSON.stringify({ rows: nodeChrome?.rows, field: nodeChrome?.field }),
    );

    const fontMatches = nodeChrome?.mathTitle != null && nodeChrome?.normalTitle != null &&
        nodeChrome.mathTitle.fontSize === nodeChrome.normalTitle.fontSize &&
        nodeChrome.mathTitle.fontWeight === nodeChrome.normalTitle.fontWeight &&
        nodeChrome.mathTitle.fontFamily === nodeChrome.normalTitle.fontFamily;
    check(
        'math title typography matches a normal node title',
        fontMatches,
        JSON.stringify({ math: nodeChrome?.mathTitle, normal: nodeChrome?.normalTitle }),
    );
    check(
        'math title is 14px/700 sans, not monospace',
        nodeChrome?.mathTitle?.fontSize === '14px' &&
            nodeChrome?.mathTitle?.fontWeight === '700' &&
            !/mono|Menlo|Consolas/i.test(nodeChrome?.mathTitle?.fontFamily ?? ''),
        JSON.stringify(nodeChrome?.mathTitle),
    );

    // Collapsed: the port remains, the title stays the typeset expression.
    await page.locator('[data-testid="math-expression-node"] .math-toggle').first().click();
    await sleep(300);
    const collapsedChrome = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="math-expression-node"]');
        if (node == null) return null;
        const rect = node.getBoundingClientRect();
        const socketHost = node.querySelector('[data-testid="math-return-socket"]');
        const socketEl = socketHost?.querySelector('.socket') ?? socketHost;
        const socket = socketEl?.getBoundingClientRect();
        return {
            field: node.querySelector('[data-testid="math-field"]') != null,
            socketVisible: socket != null && socket.width > 0 && socket.height > 0,
            socket: socket ? { right: socket.right, top: socket.top } : null,
            node: { right: rect.right, top: rect.top },
            title: node.querySelector('[data-testid="math-title"]')?.textContent?.trim() ?? null,
            titleFontSize: getComputedStyle(node.querySelector('[data-testid="math-title"]')).fontSize,
        };
    });
    check(
        'collapsed node keeps the return socket visible at the top-right',
        collapsedChrome != null && collapsedChrome.field === false && collapsedChrome.socketVisible &&
            Math.abs((collapsedChrome.socket?.right ?? -99) - (collapsedChrome.node?.right ?? -98)) <= 10 &&
            (collapsedChrome.socket?.top ?? 9999) - (collapsedChrome.node?.top ?? 0) <= 60,
        JSON.stringify(collapsedChrome),
    );
    check(
        'collapsed title still shows the typeset expression at 14px',
        collapsedChrome?.title?.includes('\\pi') === true && collapsedChrome?.titleFontSize === '14px',
        JSON.stringify({ title: collapsedChrome?.title, fontSize: collapsedChrome?.titleFontSize }),
    );
    await page.locator('[data-testid="math-expression-node"] .math-toggle').first().click();
    await sleep(300);
    await shot('06-chrome');

    // 7. Type propagation through a real wire: quantity producer `5 mm` into
    //    `x * 2` must turn the return socket type from 'return' (unknown) into
    //    ValueWithUnits. Nodes are added through the real palette.
    const addMathAt = async (x, y) => {
        await page.mouse.click(x, y);
        await page.keyboard.press('Shift+A');
        const p = page.locator('.palette[role="dialog"]');
        await p.waitFor({ state: 'visible', timeout: 10000 });
        await page.locator('.palette-search').fill('math');
        const item = page.locator('.palette-item', { hasText: 'Math expression' }).first();
        await item.waitFor({ state: 'visible', timeout: 5000 });
        await item.click();
        await p.waitFor({ state: 'hidden', timeout: 10000 });
        await sleep(400);
    };
    const typeInto = async (locator, text) => {
        await locator.locator('[data-testid="math-field-rendered"]').click();
        const src = locator.locator('[data-testid="math-field-source"]');
        await src.waitFor({ state: 'visible', timeout: 5000 });
        await src.fill(text);
        await page.keyboard.press('Enter');
        await sleep(350);
    };

    await addMathAt(1080, 380);
    // Locate by source (paint order is owned by NodeOrderKeeper, so DOM
    // order is not creation order). A freshly added node has an empty title.
    const bySource = (source) =>
        page
            .locator('[data-testid="math-expression-node"]')
            .filter({ has: page.locator(`[data-testid="math-title"][title="${source}"]`) })
            .first();
    const blankMathNode = () =>
        page
            .locator('[data-testid="math-expression-node"]')
            .filter({ has: page.locator('[data-testid="math-title"][title=""]') })
            .first();
    const producerBlank = blankMathNode();
    await producerBlank.waitFor({ state: 'visible', timeout: 5000 });
    await typeInto(producerBlank, '5 mm');
    const producer = bySource('5 mm');
    await producer.waitFor({ state: 'visible', timeout: 5000 });

    await addMathAt(320, 660);
    const consumerBlank = blankMathNode();
    await consumerBlank.waitFor({ state: 'visible', timeout: 5000 });
    await typeInto(consumerBlank, 'x * 2');
    const consumer = bySource('x * 2');
    await consumer.waitFor({ state: 'visible', timeout: 5000 });
    await shot('07-type-before');

    const before = await consumer.evaluate((el) => {
        const socket = el.querySelector('[data-testid="math-return-socket"] .socket');
        return { returnLabel: socket?.getAttribute('title') ?? null };
    });
    check('return socket starts untyped (label "return", not a type)', before.returnLabel === 'return', JSON.stringify(before));

    // Real drag: producer.return -> consumer.x. Both ports are live DOM;
    // aim at the socket component wrapper (the inner rect is 7px) and add a
    // mid-flight step, matching the other harness wire drags.
    const outBox = await producer.locator('[data-testid="math-return-socket"] .socket').boundingBox();
    const inBox = await consumer.locator('[data-testid="math-input-socket-x"] .socket').boundingBox();
    check('both quantity wire endpoints are on screen', outBox != null && inBox != null, JSON.stringify({ outBox, inBox }));
    const connectionsBefore = await page.evaluate(() => window.editor.getConnections().length);
    if (outBox != null && inBox != null) {
        const from = { x: outBox.x + outBox.width / 2, y: outBox.y + outBox.height / 2 };
        const to = { x: inBox.x + inBox.width / 2, y: inBox.y + inBox.height / 2 };
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await sleep(150);
        await page.mouse.move(from.x + 40, from.y, { steps: 10 });
        await sleep(200);
        await page.mouse.move(to.x, to.y, { steps: 40 });
        await sleep(350);
        await page.mouse.up();
        await sleep(800);
    }
    // Pointer wiring is the primary path; headless synthetic drags on a
    // custom node view can miss, so fall back to the same editor API the
    // drag calls (`window.editor.addConnection`), as the task allows.
    let wiredBy = 'drag';
    if ((await page.evaluate(() => window.editor.getConnections().length)) === connectionsBefore) {
        wiredBy = 'editor-api';
        await page.evaluate(async () => {
            const nodes = window.editor.getNodes();
            const producerNode = nodes.find((n) => n.source === '5 mm');
            const consumerNode = nodes.find((n) => n.source === 'x * 2');
            await window.editor.addConnection({
                id: `qa-math-${Date.now()}`,
                source: producerNode.id,
                sourceOutput: 'return',
                target: consumerNode.id,
                targetInput: 'x',
            });
        });
        await sleep(600);
    }
    check('a quantity producer is wired into the consumer input', (await page.evaluate(() => window.editor.getConnections().length)) > connectionsBefore, `via ${wiredBy}`);
    await shot('08-type-connected');

    const propagated = await page.evaluate(() => {
        const nodes = window.editor?.getNodes?.() ?? [];
        const consumerNode = nodes.find((n) => n.source === 'x * 2');
        const producerNode = nodes.find((n) => n.source === '5 mm');
        return {
            connections: window.editor?.getConnections?.().length ?? null,
            producerType: producerNode?.getReturnType?.() ?? producerNode?.outputs?.return?.socket?.valueType ?? null,
            binding: consumerNode?.bindings?.x ?? null,
            returnType: consumerNode?.getReturnType?.() ?? consumerNode?.outputs?.return?.socket?.valueType ?? null,
        };
    });
    propagated.returnLabel = await consumer
        .locator('[data-testid="math-return-socket"] .socket')
        .getAttribute('title');
    check(
        'connecting a quantity binds the input variable type',
        propagated.binding != null && propagated.binding.name === 'ValueWithUnits',
        JSON.stringify(propagated.binding),
    );
    check(
        'return socket type is ValueWithUnits after the quantity connection',
        propagated.returnType != null && propagated.returnType.name === 'ValueWithUnits',
        JSON.stringify(propagated.returnType),
    );
    check(
        'rendered return socket type label is not "unknown"',
        propagated.returnLabel != null && propagated.returnLabel !== 'return' && /ValueWithUnits/.test(propagated.returnLabel),
        propagated.returnLabel ?? 'null',
    );

    // Disconnect through the editor API: the binding and the derived return
    // type must recompute back to untyped.
    const removed = await page.evaluate(async () => {
        const nodes = window.editor.getNodes();
        const consumerNode = nodes.find((n) => n.source === 'x * 2');
        const producerNode = nodes.find((n) => n.source === '5 mm');
        const conns = window.editor.getConnections().filter(
            (c) => c.source === producerNode?.id && c.target === consumerNode?.id,
        );
        for (const c of conns) await window.editor.removeConnection(c.id);
        return conns.length;
    });
    await sleep(500);
    const cleared = await page.evaluate(() => {
        const nodes = window.editor.getNodes();
        const consumerNode = nodes.find((n) => n.source === 'x * 2');
        return {
            binding: consumerNode?.bindings?.x ?? null,
            returnType: consumerNode?.getReturnType?.()?.name ?? null,
        };
    });
    cleared.returnLabel = await consumer
        .locator('[data-testid="math-return-socket"] .socket')
        .getAttribute('title');
    check('disconnect removed the wire', removed > 0, `removed=${removed}`);
    check(
        'disconnecting clears the binding and recomputes the return type',
        cleared.binding == null && cleared.returnType === 'unknown' && cleared.returnLabel === 'return',
        JSON.stringify(cleared),
    );
    await shot('09-type-disconnected');

    // 8. Invalid expression keeps the error surface (field stays, styled).
    await page.locator('[data-testid="math-field-rendered"]').first().click();
    await page.locator('[data-testid="math-field-source"]').first().fill('sqrt(');
    await page.keyboard.press('Enter');
    await sleep(300);
    const invalid = await page.evaluate(() => {
        const field = document.querySelector('[data-testid="math-field"]');
        return {
            error: document.querySelector('[data-testid="math-error"]')?.textContent?.trim() ?? null,
            invalid: field?.classList.contains('invalid') ?? false,
            katex: field?.querySelectorAll('.katex').length ?? 0,
            previews: document.querySelectorAll('.math-preview').length,
        };
    });
    check('invalid expression shows the error and marks the field', invalid.invalid && invalid.error != null && invalid.error.length > 0, JSON.stringify(invalid));
    check('invalid expression falls back to plain source, not stale math', invalid.katex === 0 && invalid.previews === 0, JSON.stringify(invalid));

    // Restore a valid expression so the final screenshots are representative.
    await page.locator('[data-testid="math-field-rendered"]').first().click();
    await page.locator('[data-testid="math-field-source"]').first().fill(EXPRESSION);
    await page.keyboard.press('Enter');
    await sleep(300);
    await shot('06-final');

    check('no console errors or page errors', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));

    writeFileSync(
        `${OUT}results.json`,
        JSON.stringify({ url: URL, expression: EXPRESSION, checks, failures, consoleErrors, final: state }, null, 2),
    );
    console.log(JSON.stringify({ checks: checks.length, failed: failures, consoleErrors }, null, 2));
} catch (error) {
    failures.push(`harness error: ${error.message}`);
    console.error('MATH-FIELD ERROR:', error.stack ?? error.message);
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
    console.error(`MATH-FIELD FAIL: ${failures.join(' | ')}`);
    process.exitCode = 1;
} else {
    console.log('MATH-FIELD PASS');
}
