/**
 * Issue #15 — Evaluate-FeatureScript debug harness.
 *
 * Generation, typed parsing, error attribution and payload bounds, all
 * against a stubbed `evalFeatureScript` — no live Onshape session.
 */

import { describe, expect, it, vi } from 'vitest';
import type { BTFeatureScriptEvalResponse1859 } from 'onshape-typescript-fetch';
import {
    attributeNotices,
    evaluateDebugScript,
    generateDebugScript,
    parseFSValue,
    selectionKey,
    type DebugNodeSource,
    type DebugSelection,
    type EvalFeatureScriptApiLike,
    type EvalFeatureScriptRequestShape,
} from '../evalfeaturescript';
import type { FeatureStudioTarget } from '../featurestudiotarget';

const TARGET: FeatureStudioTarget = { did: 'did-1', wvm: 'w', wvmid: 'ws-1', eid: 'ps-1' };
const MICRO = 'micro-1';

const NODES: DebugNodeSource[] = [
    { nodeId: 'n1', variable: 'length', statements: ['var length = 5 * meter;'] },
    { nodeId: 'n2', variable: 'point', statements: ['var point = vector(1, 2, 3);'] },
];
const SELECTIONS: DebugSelection[] = [
    { nodeId: 'n1', socket: 'out' },
    { nodeId: 'n2', socket: 'out' },
];

function stubApi(response: BTFeatureScriptEvalResponse1859 | Error): {
    api: EvalFeatureScriptApiLike;
    calls: EvalFeatureScriptRequestShape[];
} {
    const calls: EvalFeatureScriptRequestShape[] = [];
    const api: EvalFeatureScriptApiLike = {
        evalFeatureScript: vi.fn(async (request: EvalFeatureScriptRequestShape) => {
            calls.push(request);
            if (response instanceof Error) throw response;
            return response;
        }),
    };
    return { api, calls };
}

describe('generateDebugScript', () => {
    it('returns a map keyed "nodeId.socket" for each selection', () => {
        const { script, keys } = generateDebugScript(NODES, SELECTIONS);
        expect(keys).toEqual(['n1.out', 'n2.out']);
        expect(script).toContain('function(context, queries)');
        expect(script).toContain('var length = 5 * meter;');
        expect(script).toContain('debugResult["n1.out"] = length;');
        expect(script).toContain('debugResult["n2.out"] = point;');
        expect(script).toContain('return debugResult;');
    });

    it('rejects a selection naming an unknown node', () => {
        expect(() => generateDebugScript(NODES, [{ nodeId: 'nope', socket: 'out' }]))
            .toThrow(/unknown node "nope"/);
    });

    it('rejects an invalid variable identifier', () => {
        const bad: DebugNodeSource[] = [{ nodeId: 'n1', variable: 'not valid!', statements: [] }];
        expect(() => generateDebugScript(bad, SELECTIONS.slice(0, 1)))
            .toThrow(/not a valid FeatureScript identifier/);
    });

    it('escapes keys for the FeatureScript string literal', () => {
        const { script } = generateDebugScript(
            [{ nodeId: 'n"1', variable: 'v', statements: [] }],
            [{ nodeId: 'n"1', socket: 'out' }],
        );
        expect(script).toContain('debugResult["n\\"1.out"] = v;');
    });

    it('caps the number of values and reports the truncation', () => {
        const { keys, truncatedSelections } = generateDebugScript(NODES, SELECTIONS, { maxValues: 1 });
        expect(keys).toEqual(['n1.out']);
        expect(truncatedSelections).toBe(1);
    });
});

describe('parseFSValue', () => {
    it('parses numbers, ValueWithUnits, strings and booleans', () => {
        expect(parseFSValue({ btType: 'BTFSValueNumber-772', value: 3.5 }))
            .toEqual({ kind: 'number', value: 3.5 });
        expect(parseFSValue({ btType: 'BTFSValueWithUnits-1817', value: 5, unitToPower: { length: 1 } }))
            .toEqual({ kind: 'units', value: 5, unitToPower: { length: 1 } });
        expect(parseFSValue({ btType: 'BTFSValueString-1422', value: 'hi' }))
            .toEqual({ kind: 'string', value: 'hi' });
        expect(parseFSValue({ btType: 'BTFSValueBoolean-1195', value: true }))
            .toEqual({ kind: 'boolean', value: true });
    });

    it('parses arrays (Vectors serialise as arrays of ValueWithUnits)', () => {
        const parsed = parseFSValue({
            btType: 'BTFSValueArray-1499',
            value: [
                { btType: 'BTFSValueWithUnits-1817', value: 1, unitToPower: { length: 1 } },
                { btType: 'BTFSValueWithUnits-1817', value: 2, unitToPower: { length: 1 } },
            ],
        });
        expect(parsed).toEqual({
            kind: 'array',
            truncated: false,
            items: [
                { kind: 'units', value: 1, unitToPower: { length: 1 } },
                { kind: 'units', value: 2, unitToPower: { length: 1 } },
            ],
        });
    });

    it('parses maps, undefined, too-big and other', () => {
        expect(parseFSValue({
            btType: 'BTFSValueMap-2062',
            value: { a: { btType: 'BTFSValueNumber-772', value: 1 } },
        })).toEqual({ kind: 'map', truncated: false, entries: { a: { kind: 'number', value: 1 } } });
        expect(parseFSValue({ btType: 'BTFSValueUndefined-2003' })).toEqual({ kind: 'undefined' });
        expect(parseFSValue({ btType: 'BTFSValueTooBig-1247' })).toEqual({ kind: 'too-big' });
        expect(parseFSValue({ btType: 'BTFSValueOther-1124', type: 'vector' }))
            .toEqual({ kind: 'other', type: 'vector' });
    });

    it('bounds arrays: extra items are dropped, truncation flagged', () => {
        const parsed = parseFSValue(
            {
                btType: 'BTFSValueArray-1499',
                value: Array.from({ length: 5 }, (_, i) => ({ btType: 'BTFSValueNumber-772', value: i })),
            },
            { maxArrayItems: 2 },
        );
        expect(parsed.kind).toBe('array');
        if (parsed.kind !== 'array') return;
        expect(parsed.items).toHaveLength(2);
        expect(parsed.truncated).toBe(true);
    });

    it('stringifies maps over the entry cap instead of expanding them', () => {
        const parsed = parseFSValue(
            {
                btType: 'BTFSValueMap-2062',
                value: Object.fromEntries(
                    Array.from({ length: 10 }, (_, i) => [`k${i}`, { btType: 'BTFSValueNumber-772', value: i }]),
                ),
            },
            { maxMapEntries: 3, maxPreviewChars: 40 },
        );
        expect(parsed.kind).toBe('map');
        if (parsed.kind !== 'map') return;
        expect(parsed.entries).toEqual({});
        expect(parsed.truncated).toBe(true);
        expect(parsed.preview!.length).toBeLessThanOrEqual(41);
    });
});

describe('attributeNotices', () => {
    it('attributes a notice to its nodeId/parameterId', () => {
        const errors = attributeNotices(
            [{ btType: 'BTNotice-227', level: 'ERROR', message: 'boom', nodeId: 'n1', parameterId: 'out' }],
            SELECTIONS,
        );
        expect(errors).toEqual([{ key: 'n1.out', socket: 'out', nodeId: 'n1', message: 'boom', level: 'ERROR' }]);
    });

    it('attributes by selection key mentioned in the message', () => {
        const errors = attributeNotices(
            [{ level: 'ERROR', message: 'failed evaluating n2.out' }],
            SELECTIONS,
        );
        expect(errors[0]).toMatchObject({ nodeId: 'n2', socket: 'out', key: 'n2.out' });
    });

    it('leaves unattributable notices unattributed rather than guessing', () => {
        const errors = attributeNotices([{ level: 'ERROR', message: 'mystery' }], SELECTIONS);
        expect(errors[0].nodeId).toBeNull();
    });
});

describe('evaluateDebugScript', () => {
    const okResponse = (): BTFeatureScriptEvalResponse1859 => ({
        btType: 'BTFeatureScriptEvalResponse-1859',
        result: {
            btType: 'BTFSValueMap-2062',
            value: {
                'n1.out': { btType: 'BTFSValueWithUnits-1817', value: 5, unitToPower: { length: 1 } },
                'n2.out': {
                    btType: 'BTFSValueArray-1499',
                    value: [
                        { btType: 'BTFSValueWithUnits-1817', value: 1, unitToPower: { length: 1 } },
                        { btType: 'BTFSValueWithUnits-1817', value: 2, unitToPower: { length: 1 } },
                        { btType: 'BTFSValueWithUnits-1817', value: 3, unitToPower: { length: 1 } },
                    ],
                },
            },
        } as never,
    });

    it('calls evalFeatureScript with the current microversion and returns typed values', async () => {
        const { api, calls } = stubApi(okResponse());
        const result = await evaluateDebugScript(api, TARGET, MICRO, NODES, SELECTIONS);

        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({
            did: 'did-1', wvm: 'w', wvmid: 'ws-1', eid: 'ps-1',
            elementMicroversionId: MICRO,
        });
        expect(calls[0].bTFeatureScriptEvalCall2377).toMatchObject({
            libraryVersion: 2960,
            rejectMicroversionSkew: true,
            sourceMicroversion: MICRO,
        });
        expect(calls[0].bTFeatureScriptEvalCall2377?.script).toContain('debugResult["n1.out"] = length;');

        expect(result.values['n1.out']).toEqual({ kind: 'units', value: 5, unitToPower: { length: 1 } });
        expect(result.values['n2.out'].kind).toBe('array');
        expect(result.errors).toEqual([]);
        // Source and raw response kept for inspection.
        expect(result.script).toBe(calls[0].bTFeatureScriptEvalCall2377?.script);
        expect(result.rawResponse).toBeDefined();
        expect(result.request).toBe(calls[0]);
    });

    it('reports an evaluation error against the producing node', async () => {
        const { api } = stubApi({
            btType: 'BTFeatureScriptEvalResponse-1859',
            notices: [{ level: 'ERROR', message: 'division by zero', nodeId: 'n1', parameterId: 'out' }],
        });
        const result = await evaluateDebugScript(api, TARGET, MICRO, NODES, SELECTIONS);

        const nodeError = result.errors.find((e) => e.nodeId === 'n1');
        expect(nodeError).toMatchObject({ key: 'n1.out', message: 'division by zero', level: 'ERROR' });
        // The other selection also missed its value, attributed to its node.
        expect(result.errors.find((e) => e.key === 'n2.out')?.nodeId).toBe('n2');
    });

    it('turns a transport failure into an unattributed error, keeping the script', async () => {
        const { api } = stubApi(new Error('network down'));
        const result = await evaluateDebugScript(api, TARGET, MICRO, NODES, SELECTIONS);
        expect(result.errors).toEqual([{ nodeId: null, message: 'network down' }]);
        expect(result.values).toEqual({});
        expect(result.script).toContain('function(context, queries)');
        expect(result.rawResponse).toBeUndefined();
    });

    it('keys values exactly as "nodeId.socket"', () => {
        expect(selectionKey({ nodeId: 'n1', socket: 'out' })).toBe('n1.out');
    });
});
