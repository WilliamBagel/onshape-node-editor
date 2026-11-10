#!/usr/bin/env node
// Utility/correctness check (permanent harness, qa:util-graph).
//
// Covers the clipboard, command-dispatch and math-type-propagation edge cases
// that are easy to regress without a real canvas:
//
//   math      — a math return type propagates through wires drawn in either
//               order, follows the first producer, falls back to the next when
//               it is removed, and cascades after a source edit.
//   clipboard — custom-feature parameters survive copy/paste; frames are not
//               copied so a pasted child is ungrouped; a group instance keeps
//               its definition; a pasted node can be deleted without leaving
//               dangling wires; Build and a serialize/load round-trip still
//               work; repeated Ctrl+V and held-key auto-repeat behave.
//   groups    — a node pasted while editing another group becomes a member
//               and is serialized with that definition; boundary cards and
//               frames are never copyable.
//
// The dev server is started on port 5243 if nothing is listening there, and
// stopped again on exit. Report + screenshots: tmp/qa-runs/util-graph/.
//
// Usage: pnpm qa:util-graph
//        QA_UTIL_URL=http://127.0.0.1:5243/onshape-node-editor/ pnpm qa:util-graph
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.QA_UTIL_URL ?? 'http://127.0.0.1:5243/onshape-node-editor/';
const PORT = '5243';
const OUT = 'tmp/qa-runs/util-graph/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const boot = async () => {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('.node').length > 0, null, { timeout: 30000 });
    await sleep(700);
};

/** Bounding box of a node header, located by live model id. */
const headerBox = (id) => page.evaluate((nodeId) => {
    const element = [...document.querySelectorAll('.node')].find(
        (node) => node.__vueParentComponent?.props?.data?.id === nodeId,
    );
    if (element == null) return null;
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + 16 };
}, id);

const clickNode = async (id) => {
    const box = await headerBox(id);
    if (box == null) throw new Error(`no DOM node for ${id}`);
    await page.mouse.click(box.x, box.y);
    await sleep(250);
};

const state = () => page.evaluate(() => ({
    nodes: window.editor.getNodes().map((node) => ({ id: node.id, type: node.type, title: node.getTitle?.() ?? '' })),
    connections: window.editor.getConnections().map((connection) => ({
        id: connection.id,
        source: connection.source,
        sourceOutput: connection.sourceOutput,
        target: connection.target,
        targetInput: connection.targetInput,
    })),
}));

const build = () => page.evaluate(async () => {
    try {
        const source = await window.controls.studioEvents.build();
        return { ok: true, length: source?.length ?? 0 };
    } catch (error) {
        return { ok: false, error: String(error?.message ?? error) };
    }
});

const loadRoundTrip = () => page.evaluate(async () => {
    const editor = window.editor;
    const text = window.controls.serializeGraph();
    const document = JSON.parse(text);
    const specs = new Map();
    for (const node of editor.getNodes()) {
        if (node.type === 'CustomFeature') specs.set(node.getFeatureSpec().featureType, node.getFeatureSpec());
    }
    try {
        const result = await window.controls.loadGraph(text, (ref) => specs.get(ref.featureType));
        return {
            ok: true,
            documentNodes: document.nodes.length,
            documentConnections: document.connections.length,
            liveNodes: editor.getNodes().length,
            liveConnections: editor.getConnections().length,
            warnings: result?.warnings ?? [],
        };
    } catch (error) {
        return { ok: false, error: String(error?.message ?? error) };
    }
});

try {
    // ---------------------------------------------------------------------
    // Math type propagation
    // ---------------------------------------------------------------------
    await boot();
    const math = await page.evaluate(async () => {
        const controls = window.controls;
        const editor = window.editor;
        const source = await controls.addMathExpressionNode({ x: 250, y: 250 });
        source.setSource('7 mm');
        const middle = await controls.addMathExpressionNode({ x: 550, y: 250 });
        middle.setSource('x * 2');
        const last = await controls.addMathExpressionNode({ x: 850, y: 250 });
        last.setSource('y * 3');
        const second = await controls.addMathExpressionNode({ x: 250, y: 500 });
        second.setSource('7');
        const wire = async (from, to, targetInput, id) => {
            await editor.addConnection({ id, source: from.id, sourceOutput: 'return', target: to.id, targetInput });
            await new Promise((resolve) => setTimeout(resolve, 120));
        };
        const snapshot = () => ({
            middle: middle.bindings.x ?? null,
            middleReturn: middle.getReturnType().name,
            last: last.bindings.y ?? null,
            lastReturn: last.getReturnType().name,
        });
        const before = snapshot();
        // Downstream wire first: order must not matter.
        await wire(middle, last, 'y', 'math-middle-last');
        const downstreamOnly = snapshot();
        await wire(source, middle, 'x', 'math-source-middle');
        const afterUpstream = snapshot();
        // A second producer must not override the first (codegen reads [0]).
        await wire(second, middle, 'x', 'math-second-middle');
        const afterSecond = snapshot();
        const sourceConnection = editor.getConnections().find((c) => c.source === source.id && c.target === middle.id);
        await editor.removeConnection(sourceConnection.id);
        await new Promise((resolve) => setTimeout(resolve, 120));
        const afterFirstRemoved = snapshot();
        const secondConnection = editor.getConnections().find((c) => c.source === second.id && c.target === middle.id);
        await editor.removeConnection(secondConnection.id);
        await new Promise((resolve) => setTimeout(resolve, 120));
        const afterAllRemoved = snapshot();
        // A source edit that changes the return type must cascade again.
        await wire(source, middle, 'x', 'math-source-middle-2');
        source.setSource('7');
        await new Promise((resolve) => setTimeout(resolve, 120));
        const afterSourceEdit = snapshot();
        return { before, downstreamOnly, afterUpstream, afterSecond, afterFirstRemoved, afterAllRemoved, afterSourceEdit,
            ids: { source: source.id, middle: middle.id, last: last.id } };
    });
    check('math: an untyped upstream leaves the downstream variable unbound',
        math.before.last == null && math.downstreamOnly.last == null,
        JSON.stringify({ before: math.before, downstreamOnly: math.downstreamOnly }));
    check('math: connecting upstream after downstream retypes the whole chain',
        math.afterUpstream.middle?.name === 'ValueWithUnits' && math.afterUpstream.last?.name === 'ValueWithUnits',
        JSON.stringify(math.afterUpstream));
    check('math: a second producer does not override the first',
        math.afterSecond.middle?.name === 'ValueWithUnits' && math.afterSecond.last?.name === 'ValueWithUnits',
        JSON.stringify(math.afterSecond));
    check('math: removing the first producer falls back to the next',
        math.afterFirstRemoved.middle?.name === 'number' && math.afterFirstRemoved.last?.name === 'number',
        JSON.stringify(math.afterFirstRemoved));
    check('math: removing the last producer reverts the chain to unknown',
        math.afterAllRemoved.middle == null && math.afterAllRemoved.last == null,
        JSON.stringify(math.afterAllRemoved));
    check('math: a source edit retypes downstream consumers',
        math.afterSourceEdit.middle?.name === 'number' && math.afterSourceEdit.last?.name === 'number',
        JSON.stringify(math.afterSourceEdit));

    await clickNode(math.ids.source);
    await page.keyboard.down('Shift');
    await clickNode(math.ids.middle);
    await page.keyboard.up('Shift');
    const beforeMathPaste = await state();
    await page.keyboard.press('Control+c');
    await sleep(250);
    await page.keyboard.press('Control+v');
    await sleep(1400);
    const mathPaste = await page.evaluate((oldIds) => {
        const editor = window.editor;
        const clones = editor.getNodes().filter(
            (node) => !oldIds.includes(node.id) && node.type === 'math-expression',
        );
        const consumer = clones.find((node) => node.source === 'x * 2');
        const producer = clones.find((node) => node.source === '7');
        return {
            count: clones.length,
            binding: consumer?.bindings.x ?? null,
            returnType: consumer?.getReturnType().name ?? null,
            wire: editor.getConnections().some((connection) => connection.source === producer?.id && connection.target === consumer?.id),
        };
    }, beforeMathPaste.nodes.map((node) => node.id));
    check('clipboard: a pasted math pair keeps its type binding and internal wire',
        mathPaste.count === 2 && mathPaste.binding?.name === 'number'
            && mathPaste.returnType === 'number' && mathPaste.wire === true,
        JSON.stringify(mathPaste));

    const mathEdit = await page.evaluate(async () => {
        const controls = window.controls;
        const editor = window.editor;
        const producer = await controls.addMathExpressionNode({ x: 300, y: 800 });
        producer.setSource('7 mm');
        const consumer = await controls.addMathExpressionNode({ x: 700, y: 800 });
        consumer.setSource('x * 2');
        await editor.addConnection({
            id: 'math-edit-wire',
            source: producer.id,
            sourceOutput: 'return',
            target: consumer.id,
            targetInput: 'x',
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
        consumer.setSource('3');
        await new Promise((resolve) => setTimeout(resolve, 400));
        const text = controls.serializeGraph();
        const specs = new Map();
        for (const node of editor.getNodes()) {
            if (node.type === 'CustomFeature') specs.set(node.getFeatureSpec().featureType, node.getFeatureSpec());
        }
        let load;
        try {
            await controls.loadGraph(text, (ref) => specs.get(ref.featureType));
            load = { ok: true };
        } catch (error) {
            load = { ok: false, error: String(error?.message ?? error) };
        }
        return {
            inputs: Object.keys(consumer.inputs),
            connections: editor.getConnections().filter((connection) => connection.target === consumer.id).length,
            binding: consumer.bindings.x ?? null,
            load,
        };
    });
    check('math: removing a variable disconnects its wire before the socket disappears',
        mathEdit.inputs.length === 0 && mathEdit.connections === 0
            && mathEdit.binding == null && mathEdit.load.ok === true,
        JSON.stringify(mathEdit));
    await shot('01-math-propagation');

    // ---------------------------------------------------------------------
    // Clipboard: custom feature, wires, build, delete, round-trip
    // ---------------------------------------------------------------------
    await boot();
    const wired = await page.evaluate(async () => {
        const editor = window.editor;
        const nodes = editor.getNodes();
        const define = nodes.find((node) => node.type === 'define-feature');
        const end = nodes.find((node) => node.type === 'output-feature');
        const chamfers = nodes.filter((node) => node.getTitle?.() === 'Chamfer');
        const add = (source, target, id) => editor.addConnection({
            id,
            source: source.id,
            sourceOutput: 'context',
            target: target.id,
            targetInput: 'context',
        });
        await add(define, chamfers[0], 'chain-a');
        await add(chamfers[0], chamfers[1], 'chain-b');
        await add(chamfers[1], end, 'chain-c');
        return { chamfers: chamfers.map((node) => node.id), define: define.id, end: end.id };
    });
    const baselineBuild = await build();
    check('build: the wired default chain builds', baselineBuild.ok, baselineBuild.error ?? `${baselineBuild.length} chars`);

    const sourceJson = await page.evaluate((id) => {
        const node = window.editor.getNode(id);
        return { json: node.toJSON(), spec: node.getFeatureSpec() };
    }, wired.chamfers[0]);

    await clickNode(wired.chamfers[0]);
    await page.keyboard.down('Shift');
    await clickNode(wired.chamfers[1]);
    await page.keyboard.up('Shift');
    const beforePair = await state();
    await page.keyboard.press('Control+c');
    await sleep(300);
    await page.keyboard.press('Control+v');
    await sleep(1600);
    const afterPair = await state();
    const pastedIds = afterPair.nodes.filter((node) => !beforePair.nodes.some((old) => old.id === node.id)).map((node) => node.id);
    check('clipboard: copying two wired Chamfers pastes both',
        pastedIds.length === 2, `${beforePair.nodes.length} -> ${afterPair.nodes.length}`);
    check('clipboard: the internal wire is remapped onto the copies',
        afterPair.connections.length === beforePair.connections.length + 1
            && afterPair.connections.some((wire) => pastedIds.includes(wire.source) && pastedIds.includes(wire.target)),
        `${beforePair.connections.length} -> ${afterPair.connections.length}`);

    const pastedJson = await page.evaluate((id) => {
        const node = window.editor.getNode(id);
        return { json: node.toJSON(), spec: node.getFeatureSpec() };
    }, pastedIds[0]);
    const parameterShape = (json) => JSON.stringify(Object.fromEntries(
        Object.entries(json.parameters ?? {}).map(([key, value]) => [key, value.value]),
    ));
    check('clipboard: custom-feature parameters survive paste',
        pastedJson.spec?.featureType === sourceJson.spec?.featureType
            && parameterShape(pastedJson.json) === parameterShape(sourceJson.json),
        `${pastedJson.spec?.featureType} / ${Object.keys(pastedJson.json.parameters ?? {}).length} params`);
    check('clipboard: the pasted custom feature has a fresh id',
        pastedIds.every((id) => id !== sourceJson.json.id), pastedIds.join(', '));

    const buildAfterPaste = await build();
    check('build: still valid after a two-node paste', buildAfterPaste.ok, buildAfterPaste.error ?? `${buildAfterPaste.length} chars`);
    const roundTripAfterPaste = await loadRoundTrip();
    check('serialize: paste then save/load keeps node and wire counts',
        roundTripAfterPaste.ok
            && roundTripAfterPaste.liveNodes === roundTripAfterPaste.documentNodes
            && roundTripAfterPaste.liveConnections === roundTripAfterPaste.documentConnections,
        JSON.stringify(roundTripAfterPaste));
    await shot('02-clipboard-pair');

    // Repeated paste cascades and never reuses an id.
    const beforeRepeat = await state();
    await page.keyboard.press('Control+v');
    await sleep(1400);
    const afterRepeat = await state();
    const repeatedIds = afterRepeat.nodes.map((node) => node.id);
    check('clipboard: repeated Ctrl+V adds another copy',
        afterRepeat.nodes.length === beforeRepeat.nodes.length + 2,
        `${beforeRepeat.nodes.length} -> ${afterRepeat.nodes.length}`);
    check('clipboard: every paste gets unique ids',
        new Set(repeatedIds).size === repeatedIds.length, `${repeatedIds.length} ids`);

    // Held-key auto-repeat must not paste.
    const beforeHeld = await state();
    await page.evaluate(() => {
        for (let index = 0; index < 4; index += 1) {
            document.body.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'v', ctrlKey: true, repeat: true, bubbles: true,
            }));
        }
    });
    await sleep(900);
    const afterHeld = await state();
    check('commands: auto-repeat does not paste', afterHeld.nodes.length === beforeHeld.nodes.length,
        `${beforeHeld.nodes.length} -> ${afterHeld.nodes.length}`);

    // Partial selection: the external wire is not copied.
    await clickNode(pastedIds[0]);
    await page.keyboard.press('Control+c');
    await sleep(250);
    const beforePartial = await state();
    await page.keyboard.press('Control+v');
    await sleep(1400);
    const afterPartial = await state();
    check('clipboard: copying one endpoint does not copy its external wire',
        afterPartial.nodes.length === beforePartial.nodes.length + 1
            && afterPartial.connections.length === beforePartial.connections.length,
        `${beforePartial.nodes.length}/${beforePartial.connections.length} -> ${afterPartial.nodes.length}/${afterPartial.connections.length}`);

    // Delete a pasted node: no dangling connections, graph still loads.
    const deleteTarget = afterPartial.nodes.find((node) => !beforePartial.nodes.some((old) => old.id === node.id));
    await clickNode(deleteTarget.id);
    await page.keyboard.press('Delete');
    await sleep(900);
    const afterDelete = await page.evaluate(() => {
        const document = JSON.parse(window.controls.serializeGraph());
        const ids = new Set(window.editor.getNodes().map((node) => node.id));
        return {
            nodes: window.editor.getNodes().length,
            connections: window.editor.getConnections().length,
            dangling: document.connections.filter((wire) => !ids.has(wire.source) || !ids.has(wire.target)).length,
        };
    });
    const roundTripAfterDelete = await loadRoundTrip();
    check('delete: deleting a pasted node leaves no dangling wires',
        afterDelete.dangling === 0 && roundTripAfterDelete.ok,
        JSON.stringify({ ...afterDelete, load: roundTripAfterDelete.ok }));
    check('delete: the graph still builds after deleting a pasted node',
        (await build()).ok, 'build after delete');

    // Zero selection copy is a no-op, and non-copyable kinds report zero.
    const nonCopyable = await page.evaluate(() => {
        const nodes = window.editor.getNodes();
        const define = nodes.find((node) => node.type === 'define-feature');
        const end = nodes.find((node) => node.type === 'output-feature');
        return {
            define: window.controls.copySelection(define),
            end: window.controls.copySelection(end),
        };
    });
    check('clipboard: Define/Output cards are not copyable',
        nonCopyable.define === 0 && nonCopyable.end === 0, JSON.stringify(nonCopyable));

    // Frame children paste ungrouped; frames themselves are not copyable.
    const framedMathId = await page.evaluate(async () => {
        const math = await window.controls.addMathExpressionNode({ x: 900, y: 550 });
        math.setSource('a + b');
        return math.id;
    });
    await clickNode(framedMathId);
    const framed = await page.evaluate(async (mathId) => {
        const controls = window.controls;
        const frame = await controls.createFrameFromSelection();
        await new Promise((resolve) => setTimeout(resolve, 300));
        const grouped = window.editor.getNode(mathId)?.group ?? null;
        const frameCopy = frame == null ? null : controls.copySelection(frame);
        return { math: mathId, frame: frame?.id ?? null, grouped, frameCopy };
    }, framedMathId);
    await clickNode(framed.math);
    await page.keyboard.press('Control+c');
    await sleep(250);
    const beforeFramePaste = await state();
    await page.keyboard.press('Control+v');
    await sleep(1200);
    const framePaste = await page.evaluate((oldIds) => {
        const clone = window.editor.getNodes().find((node) => !oldIds.includes(node.id) && node.type === 'math-expression');
        return { cloneId: clone?.id ?? null, group: clone?.group ?? null };
    }, beforeFramePaste.nodes.map((node) => node.id));
    check('frames: a frame child is copied but pasted ungrouped',
        framed.frameCopy === 0 && framePaste.group === null && framePaste.cloneId != null,
        JSON.stringify({ ...framed, clone: framePaste }));
    await shot('03-frame-child');

    // ---------------------------------------------------------------------
    // Group instance copy + paste into another group
    // ---------------------------------------------------------------------
    await boot();
    const groupIds = await page.evaluate(async () => {
        const controls = window.controls;
        const a = await controls.addMathExpressionNode({ x: 500, y: 250 }); a.setSource('1 + 2');
        const b = await controls.addMathExpressionNode({ x: 800, y: 250 }); b.setSource('3 + 4');
        const z = await controls.addMathExpressionNode({ x: 500, y: 550 }); z.setSource('5 + 6');
        return { a: a.id, b: b.id, z: z.id };
    });
    await sleep(400);
    await clickNode(groupIds.a);
    const groupA = await page.evaluate(async () => {
        const instance = await window.controls.createGroupFromSelection();
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { id: instance?.id ?? null, definitionId: instance?.definitionId ?? null };
    });
    await sleep(300);
    await clickNode(groupIds.b);
    const groupB = await page.evaluate(async () => {
        const instance = await window.controls.createGroupFromSelection();
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { id: instance?.id ?? null, definitionId: instance?.definitionId ?? null };
    });
    await sleep(300);

    await clickNode(groupA.id);
    await page.keyboard.press('Control+c');
    await sleep(250);
    const beforeGroupPaste = await state();
    await page.keyboard.press('Control+v');
    await sleep(1300);
    const groupPaste = await page.evaluate((oldIds) => {
        const clone = window.editor.getNodes().find(
            (node) => !oldIds.includes(node.id) && node.type === 'group-instance',
        );
        return { id: clone?.id ?? null, definitionId: clone?.definitionId ?? null, inputs: Object.keys(clone?.inputs ?? {}).length };
    }, beforeGroupPaste.nodes.map((node) => node.id));
    check('groups: copying a group instance keeps its definition',
        groupPaste.definitionId === groupA.definitionId && groupPaste.id !== groupA.id,
        JSON.stringify(groupPaste));

    // Paste a normal node into group B and exit: it must become a member.
    await clickNode(groupIds.z);
    await page.keyboard.press('Control+c');
    await sleep(250);
    await clickNode(groupB.id);
    await page.keyboard.press('Tab');
    await sleep(900);
    const inGroup = await page.evaluate(() => ({
        depth: window.controls.canToggleGroupEdit(),
        boundaryInput: window.editor.getNodes().find((node) => node.type === 'group-input')?.id ?? null,
    }));
    check('groups: Tab enters the group editor', inGroup.depth === true, JSON.stringify(inGroup));
    await page.keyboard.press('Control+v');
    await sleep(1200);
    await page.keyboard.press('Tab');
    await sleep(1400);
    const afterGroupExit = await page.evaluate((definitionId) => {
        const definition = window.controls.listGroupDefinitions().find((item) => item.id === definitionId);
        const document = JSON.parse(window.controls.serializeGraph());
        const serialized = (document.groupDefinitions ?? []).find((item) => item.id === definitionId);
        return {
            members: definition?.nodes.map((node) => node.id) ?? [],
            serializedMembers: serialized?.nodes.length ?? 0,
        };
    }, groupB.definitionId);
    check('groups: a node pasted inside a group becomes a member and is saved',
        afterGroupExit.members.length === 2 && afterGroupExit.serializedMembers === 2,
        JSON.stringify(afterGroupExit));

    // Boundary cards are never copyable.
    await clickNode(groupB.id);
    await page.keyboard.press('Tab');
    await sleep(900);
    const boundaryCopy = await page.evaluate(() => {
        const boundary = window.editor.getNodes().find((node) => node.type === 'group-input');
        return boundary == null ? null : window.controls.copySelection(boundary);
    });
    check('groups: a boundary card is not copyable', boundaryCopy === 0, String(boundaryCopy));
    await page.keyboard.press('Tab');
    await sleep(1000);
    await shot('04-group-paste');

    check('health: no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('health: no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

    const report = { ok: checks.every((item) => item.ok), checks };
    writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2));
    console.log(`\n${report.ok ? 'OK' : 'FAILED'} — ${checks.filter((item) => item.ok).length}/${checks.length} checks`);
    await browser.close();
    shutdown();
    process.exit(report.ok ? 0 : 1);
} catch (error) {
    console.error('util-graph-check crashed:', error);
    writeFileSync(`${OUT}report.json`, JSON.stringify({ ok: false, checks, consoleErrors, pageErrors, crash: String(error?.stack ?? error) }, null, 2));
    await shot('99-crash').catch(() => {});
    await browser.close().catch(() => {});
    shutdown();
    process.exit(1);
}
