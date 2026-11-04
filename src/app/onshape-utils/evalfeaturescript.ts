/**
 * Debug harness for `PartStudioApi.evalFeatureScript` (issue #15).
 *
 * Given a graph (as per-node FeatureScript statements plus the variable each
 * node binds its output to) and a set of selected `nodeId.socket` pairs,
 * this module:
 *
 * 1. generates a debug FeatureScript that evaluates the graph's statements
 *    inside a function returning `{ "nodeId.socket": value }` per selection,
 * 2. calls `evalFeatureScript` against the current element microversion,
 * 3. parses the typed `BTFSValue` payload (numbers, `ValueWithUnits`,
 *    strings, booleans, arrays — including Vectors, which serialise as
 *    arrays — maps and `Other`) into plain values, and
 * 4. attributes every error notice to the node that produced it.
 *
 * Payloads are bounded: the number of evaluated values, array items and map
 * entries is capped, over-large maps are stringified (truncated) instead of
 * expanded, and contexts are never dumped — nothing here reads or returns a
 * FeatureScript `context`.
 *
 * The generated source, the exact request and the raw response are kept on
 * the result so #16 (UI wiring) and manual inspection can show them.
 *
 * Verified against the vendored `onshape-typescript-fetch` client
 * (`PartStudioApi.evalFeatureScript`, `EvalFeatureScriptRequest`,
 * `BTFeatureScriptEvalCall2377`, `BTFeatureScriptEvalResponse1859`,
 * `BTFSValue1888` discriminated union, `BTNotice227`). Two things cannot be
 * verified without a live document and are marked as such below: the exact
 * shape of a serialised map value's entries (the generated
 * `BTFSValueMap2062` interface carries no fields) and the `libraryVersion`
 * value a given document expects.
 *
 * Pure data in, strings/objects out — no Vue, no editor, no Onshape session.
 * The API is a structural `EvalFeatureScriptApiLike`, so tests stub it.
 */

import type {
    BTFeatureScriptEvalResponse1859,
    BTFSValue1888,
    BTNotice227,
} from "onshape-typescript-fetch";
import type { FeatureStudioTarget } from "./featurestudiotarget";

/** One selected output socket of one node. Keyed as `"nodeId.socket"`. */
export interface DebugSelection {
    nodeId: string;
    socket: string;
}

/**
 * One node's contribution to the debug script: the FeatureScript statements
 * that compute its value (as produced by codegen, e.g.
 * `NodeFeaturescriptInfo.line` flattened per node) and the identifier its
 * output socket's value is bound to.
 */
export interface DebugNodeSource {
    nodeId: string;
    /** FeatureScript identifier the node's output is bound to. */
    variable: string;
    /** Statements computing the value, emitted verbatim, in order. */
    statements: readonly string[];
}

/** The canonical result-map key for a selection. */
export function selectionKey(selection: DebugSelection): string {
    return `${selection.nodeId}.${selection.socket}`;
}

/** Default cap on how many selected values one evaluation may return. */
export const DEFAULT_MAX_VALUES = 50;
/** Default cap on array items kept per value. */
export const DEFAULT_MAX_ARRAY_ITEMS = 100;
/** Default cap on map entries expanded per value before stringifying. */
export const DEFAULT_MAX_MAP_ENTRIES = 50;
/** Default cap on a stringified preview's length. */
export const DEFAULT_MAX_PREVIEW_CHARS = 2000;

/**
 * Default FeatureScript library version sent in the eval call. Matches the
 * `FeatureStudioGenerator` default (`"2960"`). The value a live document
 * expects is unverifiable without a session; override via
 * `EvaluateOptions.libraryVersion`.
 */
export const DEFAULT_LIBRARY_VERSION = 2960;

export interface GenerateOptions {
    /** Maximum selections evaluated; extra selections are dropped, not sent. */
    maxValues?: number;
}

export interface GeneratedDebugScript {
    /** The FeatureScript source sent as `script`. */
    script: string;
    /** Result-map keys, in evaluation order. */
    keys: string[];
    /** How many selections were dropped by `maxValues`. */
    truncatedSelections: number;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Generate the debug FeatureScript for `nodes` + `selections`.
 *
 * The result is a single function returning a map:
 *
 * ```featurescript
 * function(context, queries) {
 *   <node statements, in order>
 *   var debugResult = {};
 *   debugResult["<nodeId>.<socket>"] = <variable>;
 *   return debugResult;
 * }
 * ```
 *
 * Throws when a selection names an unknown node, a node binds an invalid
 * identifier, or a node is duplicated — those are caller bugs, not
 * evaluation failures, and must not silently produce an empty map.
 */
export function generateDebugScript(
    nodes: readonly DebugNodeSource[],
    selections: readonly DebugSelection[],
    options: GenerateOptions = {},
): GeneratedDebugScript {
    const maxValues = options.maxValues ?? DEFAULT_MAX_VALUES;
    if (!Number.isInteger(maxValues) || maxValues < 1) {
        throw new Error(`maxValues must be a positive integer (got ${maxValues}).`);
    }

    const byId = new Map<string, DebugNodeSource>();
    for (const node of nodes) {
        if (node.nodeId.trim() === '') {
            throw new Error('A debug node has an empty nodeId.');
        }
        if (byId.has(node.nodeId)) {
            throw new Error(`Duplicate debug node "${node.nodeId}".`);
        }
        if (!IDENTIFIER.test(node.variable)) {
            throw new Error(
                `Debug node "${node.nodeId}" binds variable "${node.variable}", ` +
                'which is not a valid FeatureScript identifier.',
            );
        }
        byId.set(node.nodeId, node);
    }

    const kept = selections.slice(0, maxValues);
    const truncatedSelections = selections.length - kept.length;
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const selection of kept) {
        if (!byId.has(selection.nodeId)) {
            throw new Error(
                `Selection "${selectionKey(selection)}" names unknown node "${selection.nodeId}".`,
            );
        }
        const key = selectionKey(selection);
        if (seen.has(key)) {
            throw new Error(`Duplicate selection "${key}".`);
        }
        seen.add(key);
        keys.push(key);
    }

    // Emit statements for every node, in caller order, so variables defined
    // by one node are available to later ones (mirrors codegen order).
    const lines: string[] = [
        '// Generated by the Onshape Node Editor debug harness (issue #15).',
        '// Edits will be overwritten; do not edit by hand.',
        'function(context, queries) {',
    ];
    for (const node of nodes) {
        lines.push(`\t// node ${node.nodeId}`);
        for (const statement of node.statements) {
            for (const line of statement.split('\n')) {
                lines.push(`\t${line}`);
            }
        }
    }
    lines.push('\tvar debugResult = {};');
    for (const selection of kept) {
        const node = byId.get(selection.nodeId) as DebugNodeSource;
        lines.push(`\tdebugResult[${JSON.stringify(selectionKey(selection))}] = ${node.variable};`);
    }
    lines.push('\treturn debugResult;');
    lines.push('}');

    return { script: lines.join('\n') + '\n', keys, truncatedSelections };
}

/** A parsed typed value from a `BTFSValue` payload. */
export type EvalValue =
    | { kind: 'number'; value: number }
    | { kind: 'units'; value: number; unitToPower?: Record<string, number> }
    | { kind: 'string'; value: string }
    | { kind: 'boolean'; value: boolean }
    | { kind: 'array'; items: EvalValue[]; truncated: boolean }
    | { kind: 'map'; entries: Record<string, EvalValue>; truncated: boolean; preview?: string }
    | { kind: 'undefined' }
    | { kind: 'too-big' }
    | { kind: 'other'; type?: string }
    | { kind: 'unknown'; preview: string };

export interface ParseBounds {
    maxArrayItems?: number;
    maxMapEntries?: number;
    maxPreviewChars?: number;
}

function previewOf(value: unknown, maxChars: number): string {
    let text: string;
    try {
        text = JSON.stringify(value) ?? String(value);
    } catch {
        text = String(value);
    }
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/**
 * Map entries from a serialised `BTFSValueMap`: the generated client types
 * the map with no fields, so accept both plausible shapes — an array of
 * `{ key, value }` pairs and a plain object — and report anything else as
 * unparseable rather than guessing. (Unverifiable without a live document.)
 */
function mapEntries(raw: Record<string, unknown>): Array<[string, unknown]> | undefined {
    const value = raw['value'];
    if (Array.isArray(value)) {
        const entries: Array<[string, unknown]> = [];
        for (const entry of value) {
            if (entry != null && typeof entry === 'object' && 'key' in entry) {
                const keyValue = entry as { key: unknown; value?: unknown };
                const key = typeof keyValue.key === 'string'
                    ? keyValue.key
                    : (keyValue.key as { value?: unknown } | null)?.value;
                if (typeof key === 'string') entries.push([key, keyValue.value]);
            }
        }
        return entries;
    }
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        return Object.entries(value as Record<string, unknown>);
    }
    return undefined;
}

/** Parse one `BTFSValue` (typed by `btType`) into a bounded {@link EvalValue}. */
export function parseFSValue(raw: unknown, bounds: ParseBounds = {}): EvalValue {
    const maxArrayItems = bounds.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS;
    const maxMapEntries = bounds.maxMapEntries ?? DEFAULT_MAX_MAP_ENTRIES;
    const maxPreviewChars = bounds.maxPreviewChars ?? DEFAULT_MAX_PREVIEW_CHARS;

    if (raw == null || typeof raw !== 'object') {
        return { kind: 'unknown', preview: previewOf(raw, maxPreviewChars) };
    }
    const value = raw as Record<string, unknown>;
    switch (value['btType']) {
        case 'BTFSValueNumber-772':
            return { kind: 'number', value: value['value'] as number };
        case 'BTFSValueWithUnits-1817': {
            const unitToPower = value['unitToPower'];
            return {
                kind: 'units',
                value: value['value'] as number,
                ...(unitToPower != null && typeof unitToPower === 'object'
                    ? { unitToPower: unitToPower as Record<string, number> }
                    : {}),
            };
        }
        case 'BTFSValueString-1422':
            return { kind: 'string', value: value['value'] as string };
        case 'BTFSValueBoolean-1195':
            return { kind: 'boolean', value: value['value'] as boolean };
        case 'BTFSValueArray-1499': {
            const items = Array.isArray(value['value']) ? (value['value'] as unknown[]) : [];
            return {
                kind: 'array',
                items: items.slice(0, maxArrayItems).map((item) => parseFSValue(item, bounds)),
                truncated: items.length > maxArrayItems,
            };
        }
        case 'BTFSValueMap-2062': {
            const entries = mapEntries(value);
            if (entries === undefined) {
                return { kind: 'map', entries: {}, truncated: false, preview: previewOf(value, maxPreviewChars) };
            }
            if (entries.length > maxMapEntries) {
                // Stringify large maps instead of expanding them.
                return {
                    kind: 'map',
                    entries: {},
                    truncated: true,
                    preview: previewOf(Object.fromEntries(entries), maxPreviewChars),
                };
            }
            return {
                kind: 'map',
                entries: Object.fromEntries(
                    entries.map(([key, entryValue]) => [key, parseFSValue(entryValue, bounds)]),
                ),
                truncated: false,
            };
        }
        case 'BTFSValueUndefined-2003':
            return { kind: 'undefined' };
        case 'BTFSValueTooBig-1247':
            return { kind: 'too-big' };
        case 'BTFSValueOther-1124':
            return { kind: 'other', type: value['type'] as string | undefined };
        default:
            return { kind: 'unknown', preview: previewOf(value, maxPreviewChars) };
    }
}

/** An error attributed to the node that produced it (`null` = unattributed). */
export interface AttributedError {
    /** Result-map key (`"nodeId.socket"`) when the error names a selection. */
    key?: string;
    /** Producing node, when it can be determined. */
    nodeId: string | null;
    socket?: string;
    message: string;
    level?: string;
}

const ERROR_LEVELS = new Set(['ERROR', 'INTERNAL']);

/**
 * Attribute response notices to producing nodes.
 *
 * Attribution order: the notice's own `nodeId`/`parameterId`, then a
 * selection key mentioned in the message, then — only when exactly one
 * selection was evaluated — that selection's node is *not* assumed (a
 * notice without a node is reported unattributed rather than guessed).
 * Non-error levels (warnings/info) are included so nothing is silently
 * dropped; callers distinguish by `level`.
 */
export function attributeNotices(
    notices: readonly BTNotice227[] | undefined,
    selections: readonly DebugSelection[],
): AttributedError[] {
    const errors: AttributedError[] = [];
    for (const notice of notices ?? []) {
        const message = notice.message ?? '(no message)';
        const level = notice.level as string | undefined;
        let nodeId: string | null = null;
        let socket: string | undefined;
        let key: string | undefined;

        if (typeof notice.nodeId === 'string' && notice.nodeId !== '') {
            nodeId = notice.nodeId;
            if (typeof notice.parameterId === 'string' && notice.parameterId !== '') {
                socket = notice.parameterId;
                key = `${nodeId}.${socket}`;
            }
        }
        if (nodeId === null) {
            const hit = selections.find((selection) => message.includes(selectionKey(selection)));
            if (hit !== undefined) {
                nodeId = hit.nodeId;
                socket = hit.socket;
                key = selectionKey(hit);
            }
        }
        errors.push({ ...(key !== undefined ? { key, socket } : {}), nodeId, message, level });
    }
    return errors;
}

export interface EvaluateOptions extends GenerateOptions, ParseBounds {
    /** FeatureScript library version for the eval call. */
    libraryVersion?: number;
}

export interface DebugEvalResult {
    /** Generated FeatureScript source (for inspection). */
    script: string;
    /** The exact `evalFeatureScript` request (for inspection). */
    request: EvalFeatureScriptRequestShape;
    /** The raw response, when the call returned one (for inspection). */
    rawResponse?: BTFeatureScriptEvalResponse1859;
    /** Parsed typed values by `"nodeId.socket"` key. */
    values: Record<string, EvalValue>;
    /** Errors attributed to producing nodes (plus notices). */
    errors: AttributedError[];
    /** Raw notices from the response. */
    notices: BTNotice227[];
    truncatedSelections: number;
}

/**
 * The `EvalFeatureScriptRequest` shape, as declared in the vendored
 * `PartStudioApi` (`apis/PartStudioApi.ts`). Declared structurally here
 * because the generated request type is not re-exported from the package
 * root; it matches field-for-field.
 */
export interface EvalFeatureScriptRequestShape {
    did: string;
    wvm: 'w' | 'v' | 'm';
    wvmid: string;
    eid: string;
    elementMicroversionId?: string;
    bTFeatureScriptEvalCall2377?: {
        btType?: string;
        libraryVersion?: number;
        queries?: { [key: string]: Array<string> };
        rejectMicroversionSkew?: boolean;
        script?: string;
        sourceMicroversion?: string;
    };
}

/** The slice of `PartStudioApi` this harness needs (structural, so a stub satisfies it). */
export interface EvalFeatureScriptApiLike {
    evalFeatureScript(pe: EvalFeatureScriptRequestShape): Promise<BTFeatureScriptEvalResponse1859>;
}

/**
 * Evaluate the debug script for `nodes` + `selections` against the Part
 * Studio identified by `target` at its current element `microversion`.
 *
 * Never throws for evaluation/transport failures: they are returned in
 * `errors` (unattributed) alongside the generated source and request, so the
 * caller can always show what was attempted. Generation bugs (unknown
 * node, bad identifier) still throw from {@link generateDebugScript}.
 */
export async function evaluateDebugScript(
    api: EvalFeatureScriptApiLike,
    target: FeatureStudioTarget,
    microversion: string,
    nodes: readonly DebugNodeSource[],
    selections: readonly DebugSelection[],
    options: EvaluateOptions = {},
): Promise<DebugEvalResult> {
    const { script, keys, truncatedSelections } = generateDebugScript(nodes, selections, options);
    const request: EvalFeatureScriptRequestShape = {
        did: target.did,
        wvm: target.wvm,
        wvmid: target.wvmid,
        eid: target.eid,
        elementMicroversionId: microversion,
        bTFeatureScriptEvalCall2377: {
            libraryVersion: options.libraryVersion ?? DEFAULT_LIBRARY_VERSION,
            script,
            queries: {},
            rejectMicroversionSkew: true,
            sourceMicroversion: microversion,
        },
    };

    let response: BTFeatureScriptEvalResponse1859;
    try {
        response = await api.evalFeatureScript(request);
    } catch (error) {
        return {
            script,
            request,
            values: {},
            errors: [{
                nodeId: null,
                message: error instanceof Error ? error.message : String(error),
            }],
            notices: [],
            truncatedSelections,
        };
    }

    const values: Record<string, EvalValue> = {};
    const result = response.result as BTFSValue1888 | undefined;
    if (result != null) {
        const parsed = parseFSValue(result, options);
        if (parsed.kind === 'map') {
            for (const [key, entry] of Object.entries(parsed.entries)) {
                values[key] = entry;
            }
        }
    }

    const errors = attributeNotices(response.notices, selections);
    for (const key of keys) {
        if (values[key] === undefined) {
            const selection = selections.find((s) => selectionKey(s) === key);
            errors.push({
                key,
                nodeId: selection?.nodeId ?? null,
                socket: selection?.socket,
                message: `No value returned for "${key}".`,
            });
        }
    }

    return {
        script,
        request,
        rawResponse: response,
        values,
        errors,
        notices: response.notices ?? [],
        truncatedSelections,
    };
}

/** `true` when a notice level is an error (vs warning/info). */
export function isErrorNotice(notice: BTNotice227): boolean {
    return ERROR_LEVELS.has(notice.level as string);
}
