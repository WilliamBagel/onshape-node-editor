// qa-nodechrome probe: read-only browser verification of the node-chrome
// fixes. Drives real UI (mouse drag to wire sockets, map expand does NOT
// apply to the wired pairs here so sockets survive, node collapse) and
// measures rendered geometry — connection endpoints vs live socket centers
// (screen px, path endpoint projected via getCTM), title weight, quantity
// font, caret offset, collapsed strip layout.
// Writes measurements + screenshots to tmp/qa-nodechrome/.
//
// Usage: pnpm exec vite --port 5199 --host 127.0.0.1  (dev server must serve
// the worktree) then: node scripts/qa-nodechrome-probe.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.QA_URL ?? 'http://127.0.0.1:5199/onshape-node-editor/';
const OUT = 'tmp/qa-nodechrome/';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME ?? '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const results = {};
const shot = async (name) => page.screenshot({ path: `${OUT}${name}.png` });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('.node').length >= 4, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await shot('01-boot');

async function measureConnections() {
    return page.evaluate(() => {
        const paths = [...document.querySelectorAll('[data-testid="connection"] path.path')];
        const outSockets = [
            ...document.querySelectorAll('[data-testid="output-socket"], [data-testid="collapsed-output-socket"]'),
        ];
        const inSockets = [
            ...document.querySelectorAll('[data-testid="input-socket"], [data-testid="collapsed-input-socket"]'),
        ];
        const center = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const outs = outSockets.map(center);
        const ins = inSockets.map(center);
        const toScreen = (pathEl, x, y) => {
            const pt = new DOMPoint(x, y).matrixTransform(pathEl.getCTM());
            return { x: pt.x, y: pt.y };
        };
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const nearest = (p, list) => Math.min(...list.map((q) => dist(p, q)));
        return paths.map((p) => {
            const d = p.getAttribute('d') ?? '';
            const nums = [...d.matchAll(/-?\d+\.?\d*/g)].map((m) => Number(m[0]));
            const start = toScreen(p, nums[0], nums[1]);
            const end = toScreen(p, nums[nums.length - 2], nums[nums.length - 1]);
            return {
                d: d.slice(0, 80),
                startErr: nearest(start, outs),
                endErr: nearest(end, ins),
            };
        });
    });
}

// --- create a real wire by UI drag: "entities" output -> "Entities to chamfer" input ---
const pair = await page.evaluate(() => {
    const c = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const outs = [...document.querySelectorAll('[data-testid="output-socket"]')].map((el) => ({
        ...c(el),
        label: el.closest('.output')?.querySelector('.output-title')?.textContent?.trim() ?? '',
    }));
    const ins = [...document.querySelectorAll('[data-testid="input-socket"]')].map((el) => ({
        ...c(el),
        label: el.parentElement?.parentElement?.textContent?.slice(0, 40)?.trim() ?? '',
    }));
    const out = outs.find((s) => s.label === 'entities');
    const inp = ins.find((s) => /Entities to chamfer/.test(s.label));
    return { out, inp, outs, ins };
});
results.pair = pair;
if (pair.out && pair.inp) {
    await page.mouse.move(pair.out.x, pair.out.y);
    await page.mouse.down();
    await page.mouse.move((pair.out.x + pair.inp.x) / 2, pair.out.y, { steps: 10 });
    await page.waitForTimeout(300);
    await page.mouse.move(pair.inp.x, pair.inp.y, { steps: 40 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(400);
}
results.connectionsImmediate = await measureConnections();
await page.waitForTimeout(2000);
results.connectionsSettled = await measureConnections();
await shot('02-wired');

// --- collapse the target node (sockets remount into the strip); wire must survive ---
await page.locator('.node-collapse-toggle').first().click().catch(() => {});
await page.waitForTimeout(800);
results.connectionsCollapsed = await measureConnections();
results.collapsed = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="collapsed-socket-strip"]');
    if (!strip) return null;
    const cols = (el) => {
        const kids = [...el.children].map((k) => {
            const r = k.getBoundingClientRect();
            return { x: r.x, y: r.y };
        });
        return {
            flexDirection: getComputedStyle(el).flexDirection,
            rowGap: getComputedStyle(el).rowGap,
            count: kids.length,
            xSpread: kids.length ? Math.max(...kids.map((k) => k.x)) - Math.min(...kids.map((k) => k.x)) : 0,
            ySpread: kids.length ? Math.max(...kids.map((k) => k.y)) - Math.min(...kids.map((k) => k.y)) : 0,
        };
    };
    const sr = strip.getBoundingClientRect();
    return {
        strip: { h: sr.height, paddingTop: getComputedStyle(strip).paddingTop, paddingLeft: getComputedStyle(strip).paddingLeft },
        inCol: cols(strip.querySelector('.collapsed-socket-inputs')),
        outCol: cols(strip.querySelector('.collapsed-socket-outputs')),
    };
});
await shot('03-collapsed-wired');

// --- expand back ---
await page.locator('.node-collapse-toggle').first().click().catch(() => {});
await page.waitForTimeout(800);
results.connectionsReexpanded = await measureConnections();

// --- typography: title weight, real Inter Bold via canvas widths, quantity font ---
results.typography = await page.evaluate(async () => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '700 14px Inter';
    const w700 = ctx.measureText('Chamfer').width;
    ctx.font = '400 14px Inter';
    const w400 = ctx.measureText('Chamfer').width;
    const title = document.querySelector('.node-title');
    const qty = document.querySelector('input.os-param-number');
    const titleStyle = title ? getComputedStyle(title) : null;
    const qtyStyle = qty ? getComputedStyle(qty) : null;
    let loadNote = 'not-tried';
    try { await document.fonts.load('700 16px Inter'); loadNote = 'ok'; } catch { loadNote = 'NetworkError (fake-face fallback noise)'; }
    return {
        titleFontWeight: titleStyle?.fontWeight ?? null,
        titleFontFamily: titleStyle?.fontFamily ?? null,
        titleFontSize: titleStyle?.fontSize ?? null,
        fontsLoad: loadNote,
        interFaces: [...document.fonts].filter((f) => f.family.toLowerCase().includes('inter')).map((f) => `${f.weight}/${f.status}`),
        canvasW700: Math.round(w700 * 10) / 10,
        canvasW400: Math.round(w400 * 10) / 10,
        qtyFontFamily: qtyStyle?.fontFamily ?? null,
        qtyFontSize: qtyStyle?.fontSize ?? null,
        qtyFontWeight: qtyStyle?.fontWeight ?? null,
    };
});

// --- caret geometry: caret triangle vs its label ---
results.caret = await page.evaluate(() => {
    const caret = document.querySelector('.map-dropdown-icon');
    const label = document.querySelector('.map-header-title');
    if (!caret || !label) return null;
    const c = caret.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    return {
        caretLeft: c.left,
        labelLeft: l.left,
        caretTransform: getComputedStyle(caret).transform,
        gap: l.left - c.right,
    };
});

const maxErr = (list) => Math.max(0, ...list.map((c) => Math.max(c.startErr, c.endErr ?? 0)));
results.summary = {
    wireFound: pair.out && pair.inp ? true : false,
    connections: results.connectionsSettled.length,
    maxConnErrImmediate: maxErr(results.connectionsImmediate),
    maxConnErrSettled: maxErr(results.connectionsSettled),
    maxConnErrCollapsed: maxErr(results.connectionsCollapsed),
    maxConnErrReexpanded: maxErr(results.connectionsReexpanded),
    titleWeight: results.typography.titleFontWeight,
    interBolderThanRegular: results.typography.canvasW700 > results.typography.canvasW400,
    qtyFont: results.typography.qtyFontFamily,
    qtySize: results.typography.qtyFontSize,
};

writeFileSync(`${OUT}results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.summary, null, 2));
await browser.close();
