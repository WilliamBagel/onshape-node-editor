/**
 * Issue #16 — debug grid (node-wrangler view) row model.
 *
 * Pure, DOM-free helpers so the grid's sorting, filtering, error
 * attribution, empty-state decision and preference validation are unit
 * tested without mounting the panel. The panel itself (`DebugGrid.vue`)
 * reuses the #15 harness (`evaluateDebugScript`) with an injected API
 * and a bounded, debounced refresh; everything it renders is built here.
 */

import {
    selectionKey,
    type AttributedError,
    type DebugSelection,
    type EvalValue,
} from '../onshape-utils/evalfeaturescript';

/** Grid columns, in display order. Column visibility is a persisted preference. */
export type DebugGridColumnId = 'node' | 'socket' | 'type' | 'units' | 'value';

export const DEBUG_GRID_COLUMNS: DebugGridColumnId[] = ['node', 'socket', 'type', 'units', 'value'];

export const DEBUG_GRID_COLUMN_LABELS: Record<DebugGridColumnId, string> = {
    node: 'node',
    socket: 'socket',
    type: 'type',
    units: 'units',
    value: 'value',
};

/** Full default column set (all visible). */
export const DEFAULT_DEBUG_GRID_COLUMNS: DebugGridColumnId[] = [...DEBUG_GRID_COLUMNS];

/** One rendered grid row: a single selection plus its evaluated value. */
export interface DebugGridRow {
    /** `nodeId.socket` — matches the #15 harness key. */
    key: string;
    nodeId: string;
    socket: string;
    /** Parsed value kind (`number`, `units`, `string`, `boolean`, `vector`, `unknown`). */
    type: string;
    /** Unit-power text, e.g. `length^1`; empty when the value has no units. */
    units: string;
    /** Display text for the value; empty when there is no value yet. */
    valueText: string;
    hasValue: boolean;
    /** Attributed FS errors for this row (empty when the row evaluated cleanly). */
    errors: string[];
    pinned: boolean;
}

export interface DebugGridRowSource {
    selections: DebugSelection[];
    values: Record<string, EvalValue>;
    errors: AttributedError[];
    pinnedKeys?: ReadonlySet<string>;
    /** Display labels for nodes (defaults to the node id). */
    nodeLabels?: Record<string, string>;
}

/** Format a parsed FS value for the `type` / `units` / `value` columns. */
export function formatEvalValue(value: EvalValue | undefined): { type: string; units: string; valueText: string } {
    if (value == null) return { type: 'unknown', units: '', valueText: '' };
    switch (value.kind) {
        case 'number':
            return { type: 'number', units: '', valueText: formatNumber(value.value) };
        case 'units': {
            const units = formatUnitPower(value.unitToPower);
            return { type: 'units', units, valueText: `${formatNumber(value.value)}${units ? ` ${units}` : ''}` };
        }
        case 'string':
            return { type: 'string', units: '', valueText: value.value };
        case 'boolean':
            return { type: 'boolean', units: '', valueText: value.value ? 'true' : 'false' };
        case 'array':
            return {
                type: 'array',
                units: '',
                valueText: `[${value.items.map((item) => formatEvalValue(item).valueText).join(', ')}${value.truncated ? ', …' : ''}]`,
            };
        case 'map':
            return {
                type: 'map',
                units: '',
                valueText: value.preview ?? `{ ${Object.keys(value.entries).join(', ')} }`,
            };
        case 'undefined':
            return { type: 'undefined', units: '', valueText: 'undefined' };
        case 'too-big':
            return { type: 'too-big', units: '', valueText: '(too big to display)' };
        case 'other':
            return { type: value.type ?? 'unknown', units: '', valueText: `(other: ${value.type ?? 'value'})` };
        case 'unknown':
        default:
            return { type: 'unknown', units: '', valueText: value.preview };
    }
}

function formatNumber(n: number): string {
    if (!Number.isFinite(n)) return String(n);
    // Avoid long float tails from FS arithmetic; 6 significant decimals is plenty.
    return String(Number(n.toPrecision(6)));
}

/** `length^1 · mass^-1` style text from an `unitToPower` map. */
export function formatUnitPower(unitToPower: Record<string, number>): string {
    const parts = Object.entries(unitToPower)
        .filter(([, power]) => power !== 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([unit, power]) => (power === 1 ? unit : `${unit}^${power}`));
    return parts.join(' · ');
}

/**
 * Attribute FS errors to rows. #15's `attributeNotices` keys errors by
 * `nodeId.socket` for selection-related notices, falling back to the
 * node's first selection; here we also surface node-level errors on every
 * row of that node so nothing hides.
 */
export function attributeDebugErrors(
    errors: AttributedError[],
    selections: DebugSelection[],
): Record<string, string[]> {
    const byKey: Record<string, string[]> = {};
    const firstKeyByNode = new Map<string, string>();
    for (const sel of selections) {
        if (!firstKeyByNode.has(sel.nodeId)) firstKeyByNode.set(sel.nodeId, selectionKey(sel));
    }
    for (const notice of errors) {
        const key = notice.key ?? (notice.nodeId ? firstKeyByNode.get(notice.nodeId) : undefined);
        if (key == null) continue;
        (byKey[key] ??= []).push(notice.message);
    }
    return byKey;
}

/** Build one row per selection, joining values and attributed errors. */
export function buildDebugRows(source: DebugGridRowSource): DebugGridRow[] {
    const errorsByKey = attributeDebugErrors(source.errors, source.selections);
    return source.selections.map((sel) => {
        const key = selectionKey(sel);
        const value = source.values[key];
        const formatted = formatEvalValue(value);
        return {
            key,
            nodeId: sel.nodeId,
            socket: sel.socket,
            type: formatted.type,
            units: formatted.units,
            valueText: formatted.valueText,
            hasValue: value != null,
            errors: errorsByKey[key] ?? [],
            pinned: source.pinnedKeys?.has(key) ?? false,
        };
    });
}

export interface DebugGridViewOptions {
    filter: string;
    showOnlyErrors: boolean;
    sortBy: DebugGridColumnId | 'pinned';
    sortDir: 'asc' | 'desc';
    pinnedFirst?: boolean;
}

/** Filter (substring over node/socket/type/value/error text) + sort. Stable. */
export function applyDebugGridView(rows: DebugGridRow[], options: DebugGridViewOptions): DebugGridRow[] {
    const needle = options.filter.trim().toLowerCase();
    const filtered = rows.filter((row) => {
        if (options.showOnlyErrors && row.errors.length === 0) return false;
        if (needle === '') return true;
        const haystack = [row.nodeId, row.socket, row.type, row.units, row.valueText, row.errors.join(' ')]
            .join(' ')
            .toLowerCase();
        return haystack.includes(needle);
    });
    const dir = options.sortDir === 'desc' ? -1 : 1;
    const by = options.sortBy;
    return filtered
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
            const pinnedDelta = (options.pinnedFirst === false ? 0 : Number(b.row.pinned) - Number(a.row.pinned)) * dir;
            if (pinnedDelta !== 0) return pinnedDelta;
            const cmp = compareRows(a.row, b.row, by);
            return cmp !== 0 ? cmp * dir : a.index - b.index;
        })
        .map((entry) => entry.row);
}

function compareRows(a: DebugGridRow, b: DebugGridRow, by: DebugGridColumnId | 'pinned'): number {
    switch (by) {
        case 'node':
            return a.nodeId.localeCompare(b.nodeId);
        case 'socket':
            return a.socket.localeCompare(b.socket);
        case 'type':
            return a.type.localeCompare(b.type);
        case 'units':
            return a.units.localeCompare(b.units);
        case 'value':
            return a.valueText.localeCompare(b.valueText, undefined, { numeric: true });
        case 'pinned':
            return Number(b.pinned) - Number(a.pinned);
    }
}

/** TSV row for "copy row" (visible columns only, in column order). */
export function debugRowCopyText(row: DebugGridRow, columns: DebugGridColumnId[]): string {
    return columns.map((col) => debugCellCopyText(row, col)).join('\t');
}

/** Text for "copy cell". */
export function debugCellCopyText(row: DebugGridRow, column: DebugGridColumnId): string {
    switch (column) {
        case 'node':
            return row.nodeId;
        case 'socket':
            return row.socket;
        case 'type':
            return row.type;
        case 'units':
            return row.units;
        case 'value':
            return row.valueText;
    }
}

// ── Empty-state decision ────────────────────────────────────────────────────

export type DebugGridEmptyState =
    | 'no-target'
    | 'no-selections'
    | 'no-value-yet'
    | 'evaluation-failed'
    | 'no-rows-after-filter'
    | 'ready';

export interface DebugGridEmptyStateInput {
    hasTarget: boolean;
    hasMicroversion: boolean;
    selectionCount: number;
    rowCount: number;
    evaluated: boolean;
    failed: boolean;
}

/** Exactly one explicit empty state, or `ready` when rows should render. */
export function decideDebugGridEmptyState(input: DebugGridEmptyStateInput): DebugGridEmptyState {
    if (!input.hasTarget || !input.hasMicroversion) return 'no-target';
    if (input.selectionCount === 0) return 'no-selections';
    if (input.failed) return 'evaluation-failed';
    if (!input.evaluated) return 'no-value-yet';
    if (input.rowCount === 0) return 'no-rows-after-filter';
    return 'ready';
}

export const DEBUG_GRID_EMPTY_STATE_MESSAGES: Record<Exclude<DebugGridEmptyState, 'ready'>, string> = {
    'no-target': 'No Part Studio target (or microversion) — run "Check design" first so a target exists.',
    'no-selections': 'No node outputs to inspect yet — connect nodes or add outputs to the graph.',
    'no-value-yet': 'No values yet — press Refresh to evaluate the graph.',
    'evaluation-failed': 'Evaluation failed — fix the errors above and refresh.',
    'no-rows-after-filter': 'No rows match the current filter.',
};

// ── Preference validation (persisted through editorSettings) ──────────────

export interface DebugGridPreferences {
    columns: DebugGridColumnId[];
    showOnlyErrors: boolean;
    sortBy: DebugGridColumnId | 'pinned';
    sortDir: 'asc' | 'desc';
}

export const DEFAULT_DEBUG_GRID_PREFERENCES: DebugGridPreferences = {
    columns: [...DEFAULT_DEBUG_GRID_COLUMNS],
    showOnlyErrors: false,
    sortBy: 'node',
    sortDir: 'asc',
};

const SORTABLE: (DebugGridColumnId | 'pinned')[] = [...DEBUG_GRID_COLUMNS, 'pinned'];

/** Sanitise an untrusted persisted value; never throws. */
export function sanitiseDebugGridPreferences(value: unknown): DebugGridPreferences {
    const raw = (value ?? {}) as Partial<DebugGridPreferences>;
    const seen = new Set<DebugGridColumnId>();
    const columns = (Array.isArray(raw.columns) ? raw.columns : [])
        .filter((c): c is DebugGridColumnId => DEBUG_GRID_COLUMNS.includes(c as DebugGridColumnId))
        .filter((c) => !seen.has(c) && (seen.add(c), true));
    return {
        columns: columns.length > 0 ? columns : [...DEFAULT_DEBUG_GRID_COLUMNS],
        showOnlyErrors: raw.showOnlyErrors === true,
        sortBy: SORTABLE.includes(raw.sortBy as DebugGridColumnId) ? (raw.sortBy as DebugGridColumnId) : 'node',
        sortDir: raw.sortDir === 'desc' ? 'desc' : 'asc',
    };
}

/** Validate a single preference write; `null` when rejected. */
export function validateDebugGridPreference(key: string, value: unknown): DebugGridPreferences[keyof DebugGridPreferences] | null {
    switch (key) {
        case 'columns': {
            if (!Array.isArray(value) || value.length === 0) return null;
            const seen = new Set<DebugGridColumnId>();
            for (const c of value) {
                if (!DEBUG_GRID_COLUMNS.includes(c as DebugGridColumnId) || seen.has(c as DebugGridColumnId)) return null;
                seen.add(c as DebugGridColumnId);
            }
            return [...seen];
        }
        case 'showOnlyErrors':
            return typeof value === 'boolean' ? value : null;
        case 'sortBy':
            return SORTABLE.includes(value as DebugGridColumnId) ? (value as DebugGridColumnId) : null;
        case 'sortDir':
            return value === 'asc' || value === 'desc' ? value : null;
        default:
            return null;
    }
}

// ── Bounded, debounced refresh ────────────────────────────────────────────

export interface DebouncedRefresh {
    /** Schedule a run (trailing edge); cancels any pending run. */
    call: () => void;
    cancel: () => void;
}

/** Trailing-edge debounce; a no-op in non-DOM/test contexts without timers. */
export function createDebouncedRefresh(fn: () => void, waitMs: number): DebouncedRefresh {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return {
        call() {
            if (timer != null) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                fn();
            }, waitMs);
            // Unref where supported so a pending refresh never holds the process open.
            (timer as unknown as { unref?: () => void })?.unref?.();
        },
        cancel() {
            if (timer != null) {
                clearTimeout(timer);
                timer = null;
            }
        },
    };
}

/** Default debounce for graph-change refreshes. */
export const DEBUG_GRID_DEBOUNCE_MS = 400;
