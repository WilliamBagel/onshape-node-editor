// Node-chrome style pins (jsdom cannot cascade SFC scoped styles, so —
/// like harness.test.ts — these pin the stylesheet contract by source).
// Each pin is a one-line regression for a reported defect; the browser probe
// under tmp/qa-nodechrome/ measures the rendered result for the same items.
const { readFileSync } = await import('node:fs');
import { describe, expect, it } from 'vitest';
import { COLLAPSED_SOCKET_MAX_ROWS, collapsedSocketRows } from '../nodechrome-helpers.js';

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

describe('collapsed socket strip is a max-3-row grid with sideways overflow', () => {
    it('default max rows is 3; rows clamp to sockets present and never reach 0', () => {
        expect(COLLAPSED_SOCKET_MAX_ROWS).toBe(3);
        expect(collapsedSocketRows(7)).toBe(3);
        expect(collapsedSocketRows(4)).toBe(3);
        expect(collapsedSocketRows(2)).toBe(2);
        expect(collapsedSocketRows(0)).toBe(1); // repeat(0, …) is invalid CSS
        expect(collapsedSocketRows(7, 4)).toBe(4);
        expect(collapsedSocketRows(7, 0)).toBe(1);
    });
    it('strip is one nowrap band: inputs left, outputs right, no row wrapping', () => {
        expect(nodeSrc).toMatch(/\.collapsed-socket-strip\s*\{[^}]*display:\s*flex/);
        expect(nodeSrc).toMatch(/\.collapsed-socket-strip\s*\{[^}]*flex-wrap:\s*nowrap/);
        expect(nodeSrc).toMatch(/\.collapsed-socket-strip\s*\{[^}]*align-items:\s*flex-start/);
        expect(nodeSrc).toMatch(/\.collapsed-socket-strip\s*\{[^}]*justify-content:\s*space-between/);
        expect(nodeSrc).not.toMatch(/\.collapsed-socket-strip\s*\{[^}]*flex-wrap:\s*wrap/);
    });
    it('strip is compressed (no reserved expanded min-height, tight padding)', () => {
        expect(nodeSrc).toMatch(/\.collapsed-socket-strip\s*\{[^}]*min-height:\s*0/);
        expect(nodeSrc).toMatch(/\.collapsed-socket-strip\s*\{[^}]*padding:\s*2px 6px 4px/);
        expect(nodeSrc).not.toMatch(/\.collapsed-socket-strip\s*\{[^}]*min-height:\s*24px/);
    });
    it('each side is a column-flow grid capped by the row token', () => {
        expect(nodeSrc).toMatch(/\.collapsed-socket-group\s*\{[^}]*display:\s*grid/);
        expect(nodeSrc).toMatch(/\.collapsed-socket-group\s*\{[^}]*grid-auto-flow:\s*column/);
        expect(nodeSrc).toMatch(
            /\.collapsed-socket-group\s*\{[^}]*grid-template-rows:\s*repeat\(var\(--collapsed-socket-rows\),\s*var\(--collapsed-socket-row-height\)\)/,
        );
        expect(nodeSrc).toMatch(/\.collapsed-socket-group\s*\{[^}]*grid-auto-columns:\s*var\(--collapsed-socket-column-width\)/);
        expect(nodeSrc).toMatch(/--collapsed-socket-rows:\s*3/);
        expect(nodeSrc).toMatch(/--collapsed-socket-row-height:\s*14px/);
        expect(nodeSrc).not.toMatch(/\.collapsed-socket-group\s*\{[^}]*flex-direction:\s*row/);
    });
    it('inputs overflow into columns to the RIGHT, outputs to the LEFT', () => {
        const inputRule = nodeSrc.match(/\.collapsed-socket-inputs\s*\{([^}]*)\}/)?.[1] ?? '';
        const outputRule = nodeSrc.match(/\.collapsed-socket-outputs\s*\{([^}]*)\}/)?.[1] ?? '';
        // Input grid keeps the default (ltr) inline axis: columns accrete right.
        expect(inputRule).not.toMatch(/direction:\s*rtl/);
        // Output grid flips the inline axis: column flow accretes leftwards.
        expect(outputRule).toMatch(/direction:\s*rtl/);
        expect(inputRule).toMatch(/margin-right:\s*auto/);
        expect(outputRule).toMatch(/margin-left:\s*auto/);
    });
    it('per-group inline row count is fed from the socket count and the prop', () => {
        expect(nodeSrc).toMatch(/:style="collapsedRowsStyle\(collapsedInputs\(\)\.length\)"/);
        expect(nodeSrc).toMatch(/:style="collapsedRowsStyle\(collapsedOutputs\(\)\.length\)"/);
        expect(nodeSrc).toMatch(/collapsedRowsStyle\(count:\s*number\)[\s\S]*?collapsedSocketRows\(count,\s*this\.collapsedRows\)/);
        expect(nodeSrc).toMatch(/collapsedRows:\s*\{[\s\S]*?default:\s*COLLAPSED_SOCKET_MAX_ROWS/);
    });
    it('socket anchors and test ids are preserved (every Ref stays a live port)', () => {
        expect(nodeSrc).toMatch(/data-testid="collapsed-socket-strip"/);
        expect(nodeSrc).toMatch(/data-testid="collapsed-input-socket"/);
        expect(nodeSrc).toMatch(/data-testid="collapsed-output-socket"/);
        expect(nodeSrc).toMatch(/class="collapsed-socket"/);
        expect(nodeSrc).toMatch(/<Ref v-for="socket in collapsedInputs\(\)"[\s\S]*?:data="\{ type: 'socket', side: 'input'/);
        expect(nodeSrc).toMatch(/<Ref v-for="socket in collapsedOutputs\(\)"[\s\S]*?:data="\{ type: 'socket', side: 'output'/);
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
    it('collapsed snap targets fit inside their column so neighbours stay distinct', () => {
        // 12px column + 4px gap; a 14px target protrudes 1px a side and never
        // overlaps the next column (the old 20px target overlapped by 8px).
        expect(nodeSrc).toMatch(/\.collapsed-socket :deep\(\.snap-target\)\s*\{[^}]*width:\s*14px/);
        expect(nodeSrc).toMatch(/\.collapsed-socket :deep\(\.snap-target\)\s*\{[^}]*left:\s*-1px/);
    });
    it('collapsed card does not pin expanded size inline (grows horizontally)', () => {
        expect(nodeSrc).toMatch(/'height':\s*!collapsed && Number\.isFinite\(height\)/);
        expect(nodeSrc).toMatch(/'width':\s*!collapsed && Number\.isFinite\(width\)/);
        expect(nodeSrc).toMatch(/'max-width':\s*!collapsed && Number\.isFinite\(data\.maxWidth\)/);
        expect(nodeSrc).toMatch(/\.node\.collapsed\s*\{[^}]*width:\s*max-content/);
        expect(nodeSrc).toMatch(/\.node\.collapsed\s*\{[^}]*max-width:\s*none/);
        // The expanded width is the floor (title stays legible), content may grow past it.
        expect(nodeSrc).toMatch(/'min-width':\s*collapsedMinWidth\(\)\s*!=\s*null/);
        expect(nodeSrc).toMatch(
            /collapsedMinWidth\(\):\s*number \| null\s*\{[\s\S]*?this\.collapsed && Number\.isFinite\(this\.width\)/,
        );
    });
});
