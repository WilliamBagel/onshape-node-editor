// Node-chrome style pins (jsdom cannot cascade SFC scoped styles, so —
/// like harness.test.ts — these pin the stylesheet contract by source).
// Each pin is a one-line regression for a reported defect; the browser probe
// under tmp/qa-nodechrome/ measures the rendered result for the same items.
const { readFileSync } = await import('node:fs');
import { describe, expect, it } from 'vitest';

const nodeSrc = readFileSync('src/app/customization/OnshapeNode.vue', 'utf8');
const mapSrc = readFileSync('src/app/customization/OnshapeInputMap.vue', 'utf8');
const commonSrc = readFileSync('src/app/common.css', 'utf8');
const guideSrc = readFileSync('STYLE_GUIDE.md', 'utf8');

describe('node title true bold (700)', () => {
    it('node-local token is 700', () => {
        expect(nodeSrc).toMatch(/--node-title-weight:\s*700/);
    });
    it('title rule consumes the 700 token', () => {
        expect(nodeSrc).toMatch(/font-weight:\s*var\(--node-title-weight\)\s*!important/);
    });
    it('global title token is 700 and a real Inter Bold face is loaded', () => {
        expect(commonSrc).toMatch(/--font-weight-title:\s*700/);
        expect(commonSrc).toMatch(/@font-face[\s\S]*?font-family:\s*'Inter'[\s\S]*?font-weight:\s*700/);
        expect(commonSrc).toMatch(/url\('\/onshape-node-editor\/fonts\/Inter-Bold\.woff2'\)/);
    });
    it('guide records 14px/700 titles', () => {
        expect(guideSrc).toMatch(/14px \/ 700 node titles/);
    });
});

describe('quantity inputs are sans 13px, never monospace', () => {
    it('narrow quantity rule follows the broad mono rule', () => {
        const monoIndex = nodeSrc.indexOf(":deep(input[type='text']");
        const quantityIndex = nodeSrc.indexOf(":deep(input[type='text'].os-param-number)");
        expect(monoIndex).toBeGreaterThan(-1);
        expect(quantityIndex).toBeGreaterThan(monoIndex);
    });
    it('quantity inputs get the sans value font at 13px', () => {
        expect(nodeSrc).toMatch(
            /:deep\(input\[type='text'\]\.os-param-number\)[\s\S]*?font-family:\s*var\(--node-font-sans\)\s*!important;[\s\S]*?font-size:\s*var\(--node-value-size\)\s*!important/,
        );
        expect(nodeSrc).toMatch(/--node-value-size:\s*13px/);
    });
    it('guide records quantity inputs as 13px sans', () => {
        expect(guideSrc).toMatch(/Quantity inputs are values: 13px sans/);
    });
});

describe('map collapse caret offset', () => {
    it('caret shifts 3px via transform only (label unmoved), keeping rotation', () => {
        expect(mapSrc).toMatch(/\.map-dropdown-icon[\s\S]*?transform:\s*translateX\(3px\)/);
        expect(mapSrc).toMatch(/\.expanded\s*\{[\s\S]*?translateX\(3px\)\s*rotate\(0deg\)/);
        expect(mapSrc).toMatch(/:not\(\.expanded\)\s*\{[\s\S]*?translateX\(3px\)\s*rotate\(-90deg\)/);
    });
});

describe('collapsed socket strip is vertical columns', () => {
    it('socket groups stack vertically with a 1px row gap', () => {
        expect(nodeSrc).toMatch(/\.collapsed-socket-group\s*\{[^}]*flex-direction:\s*column/);
        expect(nodeSrc).toMatch(/\.collapsed-socket-group\s*\{[^}]*gap:\s*1px/);
    });
    it('strip is compressed (no reserved expanded min-height, tight padding)', () => {
        expect(nodeSrc).toMatch(/\.collapsed-socket-strip\s*\{[^}]*min-height:\s*0/);
        expect(nodeSrc).toMatch(/\.collapsed-socket-strip\s*\{[^}]*padding:\s*2px 4px/);
        expect(nodeSrc).not.toMatch(/\.collapsed-socket-strip\s*\{[^}]*min-height:\s*24px/);
    });
    it('socket anchors and test ids are preserved', () => {
        expect(nodeSrc).toMatch(/data-testid="collapsed-socket-strip"/);
        expect(nodeSrc).toMatch(/data-testid="collapsed-input-socket"/);
        expect(nodeSrc).toMatch(/data-testid="collapsed-output-socket"/);
        expect(nodeSrc).toMatch(/class="collapsed-socket"/);
    });
    it('collapsed row height is fixed at 14px, not a min-height the 24px port box re-inflates', () => {
        // Regression: `.collapsed-socket { min-height: 14px }` measured 24px
        // per socket (the OnshapeSocket port box), so a 7-socket Chamfer
        // collapsed to 229px — only 38px under its expanded frame, and
        // taller than small expanded cards.
        expect(nodeSrc).toMatch(/\.collapsed-socket\s*\{[^}]*height:\s*14px/);
        expect(nodeSrc).toMatch(/\.collapsed-socket\s*\{[^}]*min-height:\s*0/);
        expect(nodeSrc).toMatch(/\.collapsed-socket :deep\(\.socket-container\)\s*\{[^}]*height:\s*14px/);
        expect(nodeSrc).toMatch(/\.collapsed-socket :deep\(\.socket\)\s*\{[^}]*height:\s*14px/);
        expect(nodeSrc).toMatch(/\.collapsed-socket :deep\(\.snap-target\)\s*\{[^}]*height:\s*14px/);
    });
    it('collapsed card does not pin the expanded height inline', () => {
        expect(nodeSrc).toMatch(/'height':\s*!collapsed && Number\.isFinite\(height\)/);
    });
});
