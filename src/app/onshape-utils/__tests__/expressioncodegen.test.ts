import { describe, it, expect } from 'vitest';
import {
    assembleExpressionCode,
    createStableNameAllocator,
    planExpressionBindings,
    topologicalOrder,
    ValueExpression,
} from '../expressioncodegen';
import { FeatureStudioGenerator } from '../featurestudiogenerator';
import { assembleFeatureScriptInfo, PipelineNodeInfo } from '../../rete/pipelineinfo';

const value = (partial: Partial<ValueExpression> & { nodeId: string }): ValueExpression => ({
    producer: partial.nodeId,
    expression: `${partial.nodeId}()`,
    valueType: { name: 'unknown' },
    ...partial,
});

describe('createStableNameAllocator', () => {
    it('returns the desired name first, then desired0, desired1, ... (the graph driver rule)', () => {
        const alloc = createStableNameAllocator();
        expect(alloc.allocate('result', 'a')).toBe('result');
        expect(alloc.allocate('result', 'b')).toBe('result0');
        expect(alloc.allocate('result', 'c')).toBe('result1');
    });

    it('is idempotent per (desired, nodeId), so rebuilds keep the same names', () => {
        const alloc = createStableNameAllocator();
        alloc.allocate('result', 'a');
        alloc.allocate('result', 'b');
        expect(alloc.allocate('result', 'a')).toBe('result');
        expect(alloc.allocate('result', 'b')).toBe('result0');
    });

    it('treats reserved names as already taken', () => {
        const alloc = createStableNameAllocator(['result', 'result0']);
        expect(alloc.allocate('result', 'a')).toBe('result1');
    });
});

describe('topologicalOrder', () => {
    it('orders dependencies before dependents regardless of input order', () => {
        const nodes = [
            value({ nodeId: 'transform', expression: 'transform({in})', inputs: { in: 'cross' } }),
            value({ nodeId: 'cross', expression: 'cross({a}, {b})', inputs: { a: 'vA', b: 'vB' } }),
            value({ nodeId: 'vB', expression: 'vector(0, 1, 0)' }),
            value({ nodeId: 'vA', expression: 'vector(1, 0, 0)' }),
        ];
        expect(topologicalOrder(nodes).map((n) => n.nodeId)).toEqual([
            'vA', 'vB', 'cross', 'transform',
        ]);
    });

    it('throws naming the nodes in a dependency cycle', () => {
        const nodes = [
            value({ nodeId: 'a', inputs: { in: 'b' } }),
            value({ nodeId: 'b', inputs: { in: 'a' } }),
        ];
        expect(() => topologicalOrder(nodes)).toThrow(/cycle.*a.*b|a, b/);
    });
});

describe('planExpressionBindings / dedupe', () => {
    it('deduplicates identical pure subexpressions to one binding', () => {
        const plan = planExpressionBindings([
            value({ nodeId: 'c1', producer: 'cross', expression: 'cross({a}, {b})', inputs: { a: 'x', b: 'y' } }),
            value({ nodeId: 'c2', producer: 'cross', expression: 'cross({a}, {b})', inputs: { a: 'x', b: 'y' } }),
        ]);
        expect(plan.deduped).toEqual(['c2']);
        expect(plan.bindings.get('c1')).toBe('v0');
        expect(plan.bindings.get('c2')).toBe('v0');
        expect(plan.ordered).toHaveLength(1);
    });

    it('never deduplicates impure expressions (their position is observable)', () => {
        const plan = planExpressionBindings([
            value({ nodeId: 'q1', expression: 'query()', pure: false }),
            value({ nodeId: 'q2', expression: 'query()', pure: false }),
        ]);
        expect(plan.deduped).toEqual([]);
        expect(plan.bindings.get('q1')).toBe('v0');
        expect(plan.bindings.get('q2')).toBe('v1');
    });

    it('does not merge expressions with different inferred types', () => {
        const plan = planExpressionBindings([
            value({ nodeId: 'a', expression: 'f()', valueType: { name: 'Vector' } }),
            value({ nodeId: 'b', expression: 'f()', valueType: { name: 'Matrix' } }),
        ]);
        expect(plan.deduped).toEqual([]);
    });
});

describe('assembleExpressionCode', () => {
    it('generates a vector -> cross -> transform graph as hoisted let bindings', () => {
        const info = assembleExpressionCode(
            [
                value({ nodeId: 'vec', producer: 'vector', expression: 'vector(1, 0, 0)', valueType: { name: 'Vector' } }),
                value({ nodeId: 'cross', producer: 'cross', expression: 'cross({a}, vector(0, 1, 0))', inputs: { a: 'vec' }, valueType: { name: 'Vector' } }),
                value({ nodeId: 'xf', producer: 'transform', expression: 'transform({in})', inputs: { in: 'cross' }, valueType: { name: 'Transform' } }),
            ],
            [{ nodeId: 'use', producer: 'custom-feature', info: { line: 'use(v2);' }, consumes: ['xf'] }],
        );
        expect(info.map((i) => i.line)).toEqual([
            '// vector',
            'let v0 = vector(1, 0, 0);',
            '// cross',
            'let v1 = cross(v0, vector(0, 1, 0));',
            '// transform',
            'let v2 = transform(v1);',
            'use(v2);',
        ]);
    });

    it('produces `let v0 = cross(...);` when the cross node is the first hoisted value', () => {
        const info = assembleExpressionCode(
            [
                value({
                    nodeId: 'cross', producer: 'cross',
                    expression: 'cross(vector(1, 0, 0), vector(0, 1, 0))',
                    valueType: { name: 'Vector' },
                }),
                value({ nodeId: 'xf', producer: 'transform', expression: 'transform({in})', inputs: { in: 'cross' }, valueType: { name: 'Transform' } }),
            ],
            [{ nodeId: 'use', producer: 'custom-feature', info: { line: 'use(v1);' }, consumes: ['xf'] }],
        );
        expect(info.map((i) => i.line)).toContain('let v0 = cross(vector(1, 0, 0), vector(0, 1, 0));');
    });

    it('keeps statement order and emits a binding just before its first consumer', () => {
        const info = assembleExpressionCode(
            [value({ nodeId: 'v', producer: 'vector', expression: 'vector(1, 2, 3)' })],
            [
                { nodeId: 's1', producer: 'custom-feature', info: { line: 'first();' } },
                { nodeId: 's2', producer: 'custom-feature', info: { line: 'second(v0);' }, consumes: ['v'] },
                { nodeId: 's3', producer: 'custom-feature', info: { line: 'third();' } },
            ],
        );
        expect(info.map((i) => i.line)).toEqual([
            'first();',
            '// vector',
            'let v0 = vector(1, 2, 3);',
            'second(v0);',
            'third();',
        ]);
    });

    it('emits unconsumed bindings last, in topological order', () => {
        const info = assembleExpressionCode(
            [
                value({ nodeId: 'b', expression: 'g({in})', inputs: { in: 'a' } }),
                value({ nodeId: 'a', expression: 'f()' }),
            ],
            [{ nodeId: 's', producer: 'custom-feature', info: { line: 'go();' } }],
        );
        expect(info.map((i) => i.line)).toEqual(['go();', '// a', 'let v0 = f();', '// b', 'let v1 = g(v0);']);
    });

    it('throws when a binding depends on a statement emitted after its consumer', () => {
        expect(() =>
            assembleExpressionCode(
                [value({ nodeId: 'v', expression: 'f()', statementDependencies: ['late'] })],
                [
                    { nodeId: 'early', producer: 'custom-feature', info: { line: 'early();' }, consumes: ['v'] },
                    { nodeId: 'late', producer: 'custom-feature', info: { line: 'late();' } },
                ],
            ),
        ).toThrow(/not emitted before its first consumer/);
    });

    it('assigns stable names across rebuilds, even with shuffled input order', () => {
        const nodes = [
            value({ nodeId: 'vec', producer: 'vector', expression: 'vector(1, 0, 0)' }),
            value({ nodeId: 'cross', producer: 'cross', expression: 'cross({a}, {a})', inputs: { a: 'vec' } }),
        ];
        const once = assembleExpressionCode(nodes, []);
        const twice = assembleExpressionCode([...nodes].reverse(), []);
        expect(twice).toEqual(once);
        expect(once.map((i) => i.line)).toEqual([
            '// vector', 'let v0 = vector(1, 0, 0);', '// cross', 'let v1 = cross(v0, v0);',
        ]);
    });

    it('passes expression dependencies through to the generated imports', () => {
        const info = assembleExpressionCode(
            [value({ nodeId: 'v', expression: 'dot({a}, {b})', inputs: { a: 'ext1', b: 'ext2' }, dependencies: [{ path: 'onshape/std/vector.fs', version: '2770.0' }] })],
            [],
        );
        expect(info.find((i) => i.line.startsWith('let'))?.dependencies).toEqual([
            { path: 'onshape/std/vector.fs', version: '2770.0' },
        ]);
    });
});

describe('assembleFeatureScriptInfo with expressions (pipeline integration)', () => {
    const graph = (): PipelineNodeInfo[] => [
        { id: 'define', type: 'define-feature', info: { line: 'defineFeature()', postindent: 1 } },
        {
            id: 'vec', type: 'vector', info: { line: '' },
            expression: value({ nodeId: 'vec', producer: 'vector', expression: 'vector(1, 0, 0)', valueType: { name: 'Vector' } }),
        },
        {
            id: 'cross', type: 'cross', info: { line: '' },
            expression: value({ nodeId: 'cross', producer: 'cross', expression: 'cross({a}, vector(0, 1, 0))', inputs: { a: 'vec' }, valueType: { name: 'Vector' } }),
        },
        {
            id: 'xf', type: 'transform', info: { line: '' },
            expression: value({ nodeId: 'xf', producer: 'transform', expression: 'transform({in})', inputs: { in: 'cross' }, valueType: { name: 'Transform' } }),
        },
        { id: 'op', type: 'custom-feature', info: { line: 'use(v2);' }, valueDependencies: ['xf'] },
    ];

    it('hoists value nodes and keeps the define-feature header first', () => {
        const lines = assembleFeatureScriptInfo(graph()).map((i) => i.line);
        expect(lines).toEqual([
            'defineFeature()',
            '// vector',
            'let v0 = vector(1, 0, 0);',
            '// cross',
            'let v1 = cross(v0, vector(0, 1, 0));',
            '// transform',
            'let v2 = transform(v1);',
            'use(v2);',
        ]);
    });

    it('generates compilable-looking FeatureStudio source end to end', () => {
        const source = new FeatureStudioGenerator().generateFeatureStudioCode(
            assembleFeatureScriptInfo(graph()),
        );
        expect(source).toContain('FeatureScript 2960;');
        expect(source).toContain('\tlet v1 = cross(v0, vector(0, 1, 0));');
        expect(source.indexOf('let v0')).toBeLessThan(source.indexOf('let v1'));
        expect(source.indexOf('let v1')).toBeLessThan(source.indexOf('let v2'));
        expect(source.indexOf('let v2')).toBeLessThan(source.indexOf('use(v2);'));
    });

    it('leaves the statement-only path unchanged', () => {
        const lines = assembleFeatureScriptInfo([
            { id: 'define', type: 'define-feature', info: { line: 'header', postindent: 1 } },
            { id: 'op', type: 'custom-feature', info: { line: 'body' } },
        ]).map((i) => i.line);
        expect(lines).toEqual(['header', 'body']);
    });
});
