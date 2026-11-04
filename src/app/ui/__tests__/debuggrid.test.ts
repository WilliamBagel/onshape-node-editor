/**
 * Issue #16 — debug grid (node-wrangler view) row model.
 *
 * Pure model tests: row building + error attribution, filtering/sorting,
 * copy text, the empty-state decision, preference defaults/validation and
 * the debounced refresh. No DOM, no live Onshape session.
 */

import { describe, expect, it, vi } from 'vitest';
import {
    applyDebugGridView,
    attributeDebugErrors,
    buildDebugRows,
    createDebouncedRefresh,
    decideDebugGridEmptyState,
    debugCellCopyText,
    debugRowCopyText,
    DEFAULT_DEBUG_GRID_PREFERENCES,
    formatEvalValue,
    formatUnitPower,
    sanitiseDebugGridPreferences,
    validateDebugGridPreference,
} from '../debuggrid';
import { DEFAULT_PREFERENCES, EditorSettingsStore } from '../editorSettings';
import { MemoryStorage } from '../../onshape-utils/featurestudiotarget';
import type { AttributedError, DebugSelection, EvalValue } from '../../onshape-utils/evalfeaturescript';

const SELECTIONS: DebugSelection[] = [
    { nodeId: 'n1', socket: 'out' },
    { nodeId: 'n2', socket: 'out' },
    { nodeId: 'n2', socket: 'err' },
];

const VALUES: Record<string, EvalValue> = {
    'n1.out': { kind: 'units', value: 5, unitToPower: { length: 1 } },
    'n2.out': { kind: 'number', value: 3.5 },
    'n2.err': { kind: 'string', value: 'boom' },
};

const ERRORS: AttributedError[] = [
    { key: 'n2.err', nodeId: 'n2', socket: 'err', message: 'Division by zero' },
];

const ROWS = buildDebugRows({ selections: SELECTIONS, values: VALUES, errors: ERRORS });

describe('buildDebugRows / formatEvalValue', () => {
    it('builds one row per selection with typed columns', () => {
        expect(ROWS).toHaveLength(3);
        expect(ROWS[0]).toMatchObject({
            key: 'n1.out',
            nodeId: 'n1',
            socket: 'out',
            type: 'units',
            units: 'length',
            valueText: '5 length',
            hasValue: true,
            errors: [],
            pinned: false,
        });
        expect(ROWS[1]).toMatchObject({ key: 'n2.out', type: 'number', valueText: '3.5' });
        expect(ROWS[2]).toMatchObject({ key: 'n2.err', type: 'string', valueText: 'boom' });
    });

    it('marks rows without a value as not having one yet', () => {
        const rows = buildDebugRows({ selections: SELECTIONS, values: {}, errors: [] });
        expect(rows.every((r) => !r.hasValue && r.valueText === '')).toBe(true);
    });

    it('marks pinned rows from the pinned key set', () => {
        const rows = buildDebugRows({
            selections: SELECTIONS,
            values: VALUES,
            errors: [],
            pinnedKeys: new Set(['n2.out']),
        });
        expect(rows.map((r) => r.pinned)).toEqual([false, true, false]);
    });

    it('formats every EvalValue kind', () => {
        expect(formatEvalValue({ kind: 'number', value: 1 / 3 }).valueText).toBe('0.333333');
        expect(formatEvalValue({ kind: 'boolean', value: true })).toEqual({ type: 'boolean', units: '', valueText: 'true' });
        expect(formatEvalValue({ kind: 'array', items: [{ kind: 'number', value: 1 }, { kind: 'number', value: 2 }], truncated: false }).valueText).toBe('[1, 2]');
        expect(formatEvalValue({ kind: 'map', entries: { a: { kind: 'number', value: 1 } }, truncated: false }).valueText).toBe('{ a }');
        expect(formatEvalValue({ kind: 'undefined' }).valueText).toBe('undefined');
        expect(formatEvalValue({ kind: 'too-big' }).valueText).toBe('(too big to display)');
        expect(formatEvalValue({ kind: 'other', type: 'BTMVector' }).type).toBe('BTMVector');
        expect(formatEvalValue({ kind: 'unknown', preview: '…' }).valueText).toBe('…');
        expect(formatEvalValue(undefined)).toEqual({ type: 'unknown', units: '', valueText: '' });
    });

    it('formats unit powers, skipping zero exponents', () => {
        expect(formatUnitPower({ length: 1, mass: -1, time: 0 })).toBe('length · mass^-1');
        expect(formatUnitPower({})).toBe('');
    });
});

describe('attributeDebugErrors', () => {
    it('attributes by selection key, falling back to the node’s first selection', () => {
        const byKey = attributeDebugErrors(
            [
                { nodeId: 'n2', message: 'node-level failure' },
                { key: 'n1.out', nodeId: 'n1', socket: 'out', message: 'keyed failure' },
                { nodeId: null, message: 'unattributed — dropped' },
            ],
            SELECTIONS,
        );
        expect(byKey['n2.out']).toEqual(['node-level failure']);
        expect(byKey['n1.out']).toEqual(['keyed failure']);
        expect(Object.keys(byKey)).toHaveLength(2);
    });

    it('surfaces errors on the row model', () => {
        expect(ROWS.find((r) => r.key === 'n2.err')?.errors).toEqual(['Division by zero']);
        expect(ROWS.find((r) => r.key === 'n1.out')?.errors).toEqual([]);
    });
});

describe('applyDebugGridView (filter + sort)', () => {
    it('filters by substring over node/socket/type/value/error text', () => {
        const byNode = applyDebugGridView(ROWS, { filter: 'n2', showOnlyErrors: false, sortBy: 'node', sortDir: 'asc' });
        expect(byNode.map((r) => r.key)).toEqual(['n2.out', 'n2.err']);
        const byValue = applyDebugGridView(ROWS, { filter: 'BOOM', showOnlyErrors: false, sortBy: 'node', sortDir: 'asc' });
        expect(byValue.map((r) => r.key)).toEqual(['n2.err']);
        const byError = applyDebugGridView(ROWS, { filter: 'zero', showOnlyErrors: false, sortBy: 'node', sortDir: 'asc' });
        expect(byError.map((r) => r.key)).toEqual(['n2.err']);
    });

    it('show-only-errors keeps just the failing rows', () => {
        const view = applyDebugGridView(ROWS, { filter: '', showOnlyErrors: true, sortBy: 'node', sortDir: 'asc' });
        expect(view.map((r) => r.key)).toEqual(['n2.err']);
    });

    it('sorts by column and direction, pinned first by default', () => {
        const pinned = buildDebugRows({
            selections: SELECTIONS,
            values: VALUES,
            errors: [],
            pinnedKeys: new Set(['n2.err']),
        });
        const asc = applyDebugGridView(pinned, { filter: '', showOnlyErrors: false, sortBy: 'node', sortDir: 'asc' });
        expect(asc[0].key).toBe('n2.err');
        const byValueDesc = applyDebugGridView(ROWS, { filter: '', showOnlyErrors: false, sortBy: 'value', sortDir: 'desc', pinnedFirst: false });
        expect(byValueDesc.map((r) => r.key)).toEqual(['n2.err', 'n1.out', 'n2.out']);
    });
});

describe('copy text', () => {
    it('copies a cell and a TSV row in visible-column order', () => {
        const row = ROWS[0];
        expect(debugCellCopyText(row, 'units')).toBe('length');
        expect(debugRowCopyText(row, ['node', 'socket', 'value'])).toBe('n1\tout\t5 length');
    });
});

describe('decideDebugGridEmptyState', () => {
    const base = {
        hasTarget: true,
        hasMicroversion: true,
        selectionCount: 2,
        rowCount: 2,
        evaluated: true,
        failed: false,
    };
    it('returns ready when there is nothing to complain about', () => {
        expect(decideDebugGridEmptyState(base)).toBe('ready');
    });
    it('prefers no-target over everything else', () => {
        expect(decideDebugGridEmptyState({ ...base, hasTarget: false })).toBe('no-target');
        expect(decideDebugGridEmptyState({ ...base, hasMicroversion: false })).toBe('no-target');
    });
    it('reports no-selections before failure', () => {
        expect(decideDebugGridEmptyState({ ...base, selectionCount: 0, failed: true })).toBe('no-selections');
    });
    it('reports evaluation-failed over no-value-yet', () => {
        expect(decideDebugGridEmptyState({ ...base, evaluated: false, failed: true })).toBe('evaluation-failed');
    });
    it('reports no-value-yet before a successful evaluation', () => {
        expect(decideDebugGridEmptyState({ ...base, evaluated: false, rowCount: 0 })).toBe('no-value-yet');
    });
    it('reports no-rows-after-filter when the filter hides every row', () => {
        expect(decideDebugGridEmptyState({ ...base, rowCount: 0 })).toBe('no-rows-after-filter');
    });
});

describe('debug grid preferences', () => {
    it('ships all columns visible, errors off, node ascending', () => {
        expect(DEFAULT_DEBUG_GRID_PREFERENCES).toEqual({
            columns: ['node', 'socket', 'type', 'units', 'value'],
            showOnlyErrors: false,
            sortBy: 'node',
            sortDir: 'asc',
        });
        expect(DEFAULT_PREFERENCES.debugGrid).toEqual(DEFAULT_DEBUG_GRID_PREFERENCES);
    });

    it('sanitises untrusted persisted values without throwing', () => {
        expect(sanitiseDebugGridPreferences(undefined)).toEqual(DEFAULT_DEBUG_GRID_PREFERENCES);
        expect(sanitiseDebugGridPreferences({ columns: ['value', 'bogus', 'value'], sortBy: 'nope', sortDir: 'sideways', showOnlyErrors: 'yes' })).toEqual({
            columns: ['value'],
            showOnlyErrors: false,
            sortBy: 'node',
            sortDir: 'asc',
        });
        expect(sanitiseDebugGridPreferences({ columns: [] }).columns).toEqual(DEFAULT_DEBUG_GRID_PREFERENCES.columns);
    });

    it('validates single writes, rejecting unknown keys and bad values', () => {
        expect(validateDebugGridPreference('columns', ['node'])).toEqual(['node']);
        expect(validateDebugGridPreference('columns', [])).toBeNull();
        expect(validateDebugGridPreference('columns', ['node', 'node'])).toBeNull();
        expect(validateDebugGridPreference('showOnlyErrors', true)).toBe(true);
        expect(validateDebugGridPreference('showOnlyErrors', 'yes')).toBeNull();
        expect(validateDebugGridPreference('sortBy', 'value')).toBe('value');
        expect(validateDebugGridPreference('sortBy', 'bogus')).toBeNull();
        expect(validateDebugGridPreference('sortDir', 'desc')).toBe('desc');
        expect(validateDebugGridPreference('bogus', true)).toBeNull();
    });

    it('persists through editorSettings and survives a reload', () => {
        const storage = new MemoryStorage();
        const store = new EditorSettingsStore(storage);
        expect(store.setDebugGridPreference('columns', ['node', 'value'])).toBe(true);
        expect(store.setDebugGridPreference('showOnlyErrors', true)).toBe(true);
        expect(store.setDebugGridPreference('columns', [])).toBe(false);
        const reloaded = new EditorSettingsStore(storage);
        expect(reloaded.getPreferences().debugGrid.columns).toEqual(['node', 'value']);
        expect(reloaded.getPreferences().debugGrid.showOnlyErrors).toBe(true);
    });
});

describe('createDebouncedRefresh', () => {
    it('runs once on the trailing edge and cancels pending runs', () => {
        vi.useFakeTimers();
        try {
            const fn = vi.fn();
            const debounced = createDebouncedRefresh(fn, 400);
            debounced.call();
            debounced.call();
            debounced.call();
            expect(fn).not.toHaveBeenCalled();
            vi.advanceTimersByTime(399);
            expect(fn).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(fn).toHaveBeenCalledTimes(1);
            debounced.call();
            debounced.cancel();
            vi.advanceTimersByTime(1000);
            expect(fn).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });
});
