// Regression tests for issue #72 (node chrome). Issue #72 (map dropdown,
// title editing, centred title, collapsible nodes) was fixed in
// OnshapeNode.vue / OnshapeInputMap.vue; the pure decisions those components
// call live in ../nodechrome-helpers, which is what is pinned here.
import { describe, expect, it } from 'vitest';
import type { BTFeatureSpec129 } from 'onshape-typescript-fetch';
import { OnshapeSocket } from '../../rete/onshapesockets.js';
import { OnshapeFeatureSpecInput } from '../../rete/inputoutput/onshapefeaturespecinput.js';
import {
    COLLAPSED_SOCKET_MAX_ROWS,
    collectCollapsedOutputSockets,
    collectCollapsedSockets,
    collapsedSocketRows,
    commitTitleEdit,
    expandedFromInput,
    isNestedMapInput,
    nextCollapsed,
    shouldStartTitleEdit,
    titleEditActionForKey,
    visibleParamEntries,
} from '../nodechrome-helpers.js';

function quantitySpec(parameterId: string, parameterName: string, value = 0): Record<string, unknown> {
    return {
        btType: 'BTParameterSpecQuantity-173',
        parameterId,
        parameterName,
        defaultValue: { value, units: 'mm' },
        ranges: { minimum: { value: 0 } },
    };
}

function featureSpec(parameters: Record<string, unknown>[]): BTFeatureSpec129 {
    return { parameters } as unknown as BTFeatureSpec129;
}

function mapInputWith(
    parameters: Record<string, unknown>[],
    socket = new OnshapeSocket('map'),
): OnshapeFeatureSpecInput {
    return new OnshapeFeatureSpecInput(socket, featureSpec(parameters));
}

describe('visibleParamEntries (map dropdown, #72-1)', () => {
    it('returns [] when paramInputs is missing', () => {
        expect(visibleParamEntries(undefined, undefined)).toEqual([]);
        expect(visibleParamEntries(null, null)).toEqual([]);
    });

    it('keeps an entry unless hiddenParameters marks it true', () => {
        const input = mapInputWith([quantitySpec('depth', 'Depth'), quantitySpec('width', 'Width')]);
        expect(visibleParamEntries(input.paramInputs, input.hiddenParameters).map((e) => e.key)).toEqual([
            'depth',
            'width',
        ]);
        input.hiddenParameters['depth'] = true;
        expect(visibleParamEntries(input.paramInputs, input.hiddenParameters).map((e) => e.key)).toEqual([
            'width',
        ]);
    });

    it('a nested map filters by its own hidden set, not the parent one', () => {
        const inner = mapInputWith([quantitySpec('a', 'A'), quantitySpec('b', 'B')]);
        const outer = mapInputWith([quantitySpec('x', 'X')]);
        outer.paramInputs['child'] = inner;
        outer.hiddenParameters['child'] = true;

        expect(visibleParamEntries(outer.paramInputs, outer.hiddenParameters).map((e) => e.key)).toEqual(['x']);
        expect(visibleParamEntries(inner.paramInputs, inner.hiddenParameters).map((e) => e.key)).toEqual(['a', 'b']);
    });
});

describe('isNestedMapInput (map dropdown, #72-1)', () => {
    it('is true for a map carrying child inputs', () => {
        const inner = mapInputWith([quantitySpec('a', 'A')]);
        const outer = mapInputWith([quantitySpec('x', 'X')]);
        outer.paramInputs['child'] = inner;
        expect(isNestedMapInput(outer.paramInputs['child'])).toBe(true);
        expect(isNestedMapInput(inner)).toBe(true);
        expect(isNestedMapInput({ type: 'map', paramInputs: {} })).toBe(true);
        expect(isNestedMapInput({ type: 'map' })).toBe(true);
    });

    it('is false for a leaf input', () => {
        const input = mapInputWith([quantitySpec('x', 'X')]);
        expect(isNestedMapInput(input.paramInputs['x'])).toBe(false);
        expect(isNestedMapInput(null)).toBe(false);
        expect(isNestedMapInput(undefined)).toBe(false);
    });
});

describe('expandedFromInput (reactive source, #72-1)', () => {
    it('reads the live expanded flag, defaulting to true', () => {
        const input = mapInputWith([quantitySpec('x', 'X')]);
        input.expanded = false;
        expect(expandedFromInput(input)).toBe(false);
        input.expanded = true;
        expect(expandedFromInput(input)).toBe(true);
        expect(expandedFromInput(null)).toBe(true);
        expect(expandedFromInput({})).toBe(true);
    });
});

describe('title editing (#72-2)', () => {
    it('maps Enter to commit and Escape to cancel', () => {
        expect(titleEditActionForKey('Enter')).toBe('commit');
        expect(titleEditActionForKey('Escape')).toBe('cancel');
        expect(titleEditActionForKey('a')).toBeNull();
        expect(titleEditActionForKey('Tab')).toBeNull();
    });

    it('a blank draft keeps the original title, a real draft wins', () => {
        expect(commitTitleEdit('Extrude', 'Revolve')).toBe('Revolve');
        expect(commitTitleEdit('Extrude', '')).toBe('Extrude');
        expect(commitTitleEdit('Extrude', '   ')).toBe('Extrude');
    });

    it('a click is a press that barely moved; a drag is not', () => {
        expect(shouldStartTitleEdit(10, 10, 12, 11)).toBe(true);
        expect(shouldStartTitleEdit(10, 10, 40, 10)).toBe(false);
        expect(shouldStartTitleEdit(null, null, 0, 0)).toBe(true);
    });
});

describe('collapsible nodes (#72-4)', () => {
    it('toggles the collapsed state', () => {
        expect(nextCollapsed(false)).toBe(true);
        expect(nextCollapsed(true)).toBe(false);
    });
});


describe('collapsed socket strip (node-chrome)', () => {
    it('caps the grid at 3 rows by default and grows sideways instead', () => {
        expect(COLLAPSED_SOCKET_MAX_ROWS).toBe(3);
        // 7 sockets -> 3 columns of 3/3/1, each column starts at its top row.
        expect(collapsedSocketRows(7)).toBe(3);
        expect(collapsedSocketRows(2)).toBe(2);
        expect(collapsedSocketRows(1)).toBe(1);
        // Empty groups still declare one row: repeat(0, …) is invalid CSS.
        expect(collapsedSocketRows(0)).toBe(1);
        // The limit is configurable; invalid values fall back to one row.
        expect(collapsedSocketRows(9, 5)).toBe(5);
        expect(collapsedSocketRows(9, 0)).toBe(1);
        expect(collapsedSocketRows(9, Number.NaN)).toBe(3);
    });

    it('flattens leaf inputs and nested-map children to the expanded socket data', () => {
        const inner = mapInputWith([quantitySpec('a', 'A'), quantitySpec('b', 'B')]);
        const outer = mapInputWith([quantitySpec('x', 'X')]);
        outer.paramInputs['child'] = inner;
        const entries = visibleParamEntries(outer.paramInputs, outer.hiddenParameters);
        const sockets = collectCollapsedSockets(entries, 'node-1');
        expect(sockets.map((s) => s.key)).toEqual(['x', 'a', 'b']);
        expect(sockets.every((s) => s.side === 'input' && s.nodeId === 'node-1' && s.btType !== '')).toBe(true);
        expect(sockets[0].payload).toBe(outer.paramInputs['x']);
    });

    it('respects hidden children and never registers a duplicate socket', () => {
        const inner = mapInputWith([quantitySpec('a', 'A')]);
        const outer = mapInputWith([quantitySpec('x', 'X')]);
        outer.paramInputs['child'] = inner;
        outer.paramInputs['x2'] = outer.paramInputs['x'];
        inner.hiddenParameters['a'] = true;
        const entries = visibleParamEntries(outer.paramInputs, outer.hiddenParameters);
        const sockets = collectCollapsedSockets(entries, 'node-1');
        expect(sockets.map((s) => s.key)).toEqual(['x', 'x2']);
        const keys = sockets.map((s) => `${s.side}:${s.key}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('an empty map contributes no sockets', () => {
        const empty = mapInputWith([]);
        const entries = visibleParamEntries(empty.paramInputs, empty.hiddenParameters);
        expect(entries).toEqual([]);
        expect(collectCollapsedSockets(entries, 'node-1')).toEqual([]);
        expect(collectCollapsedOutputSockets(null, 'node-1')).toEqual([]);
    });
});
