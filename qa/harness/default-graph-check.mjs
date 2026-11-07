// default-graph-check: the debug/default editor must open clean.
//
// Opens the dev server (developerMode -> devEditor.ts default sample) in a
// real browser and asserts, against the live rete editor (`window.editor`)
// and the rendered DOM (not a guess):
//   1. At least the 4 default sample nodes are rendered.
//   2. No transient group-input/group-output (boundary) nodes outside group
//      editing — they are definition-owned chrome, never top-level nodes.
//   3. No duplicate boundary ids (in fact: no duplicate node ids at all).
//   4. No node with a missing/unresolved feature spec (CustomFeature nodes
//      carry a spec with a non-empty featureType).
//   5. Every node can produce a FeatureScript line (getFeatureScriptInfo
//      does not throw) and passes its own graph validation.
//   6. No console errors and no page errors during load.
//
// Usage:
//   pnpm exec vite --port 5212 --host 127.0.0.1   (dev server, separate terminal)
//   pnpm run qa:default-graph                       (or QA_URL=... node qa/harness/default-graph-check.mjs)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.QA_URL ?? 'http://127.0.0.1:5212/onshape-node-editor/';
const OUT = 'tmp/qa-runs/default-graph/';
mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('.node').length >= 4, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}default-graph.png` });

const inventory = await page.evaluate(() => {
    const editor = window.editor;
    if (editor == null) return { error: 'window.editor is not set' };
    const nodes = editor.getNodes().map((n) => {
        let line = null;
        let lineError = null;
        try {
            line = n.getFeatureScriptInfo({})?.line ?? null;
        } catch (e) {
            lineError = e.message;
        }
        let validation = null;
        let validationError = null;
        try {
            validation = typeof n.validateGraph === 'function'
                ? n.validateGraph({ producers: {}, getNode: (id) => editor.getNode(id) })
                : null;
        } catch (e) {
            validationError = e.message;
        }
        return {
            id: n.id,
            type: n.type,
            transient: n.transient === true,
            specType: typeof n.getFeatureSpec === 'function'
                ? (n.getFeatureSpec()?.featureType ?? null)
                : 'n/a',
            lineOk: lineError == null,
            lineError,
            validation,
            validationError,
        };
    });
    return { nodes, domCount: document.querySelectorAll('.node').length };
});

if (inventory.error != null) {
    check('window.editor is available', false, inventory.error);
} else {
    console.log('Default graph inventory:');
    for (const n of inventory.nodes) {
        console.log(`  ${n.type} id=${n.id} transient=${n.transient} spec=${n.specType} lineOk=${n.lineOk} validate=${n.validation ?? 'ok'}`);
    }
    writeFileSync(`${OUT}inventory.json`, JSON.stringify(inventory, null, 1));

    check('at least 4 default nodes rendered', inventory.domCount >= 4, `domCount=${inventory.domCount}`);
    check('no transient group boundary nodes outside group editing',
        inventory.nodes.every((n) => n.type !== 'group-input' && n.type !== 'group-output' && !n.transient),
        inventory.nodes.filter((n) => n.type === 'group-input' || n.type === 'group-output' || n.transient)
            .map((n) => n.type).join(', ') || 'none found');
    const ids = inventory.nodes.map((n) => n.id);
    check('no duplicate node ids', new Set(ids).size === ids.length,
        ids.filter((id, i) => ids.indexOf(id) !== i).join(', ') || `${ids.length} unique`);
    check('no node with a missing feature spec',
        inventory.nodes.every((n) => n.specType === 'n/a' || (typeof n.specType === 'string' && n.specType !== '')),
        inventory.nodes.filter((n) => n.specType !== 'n/a' && (typeof n.specType !== 'string' || n.specType === ''))
            .map((n) => `${n.type}@${n.id}`).join(', ') || 'all specs resolved');
    check('every node can produce a FeatureScript line',
        inventory.nodes.every((n) => n.lineOk),
        inventory.nodes.filter((n) => !n.lineOk).map((n) => `${n.type}@${n.id}: ${n.lineError}`).join('; ') || 'all ok');
    check('graph validator accepts every node',
        inventory.nodes.every((n) => n.validation == null && n.validationError == null),
        inventory.nodes.filter((n) => n.validation != null || n.validationError != null)
            .map((n) => `${n.type}@${n.id}: ${n.validation ?? n.validationError}`).join('; ') || 'all ok');
}

check('no console errors', consoleErrors.length === 0, consoleErrors.join('; ') || 'none');
check('no page errors', pageErrors.length === 0, pageErrors.join('; ') || 'none');

await browser.close();
if (failures.length > 0) {
    console.log(`\ndefault-graph-check: ${failures.length} failure(s): ${failures.join('; ')}`);
    process.exit(1);
}
console.log('\ndefault-graph-check: default graph is clean');
