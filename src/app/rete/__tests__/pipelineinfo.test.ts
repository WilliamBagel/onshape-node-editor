import { describe, it, expect } from 'vitest';
import { assembleFeatureScriptInfo, PipelineNodeInfo, TOP_LEVEL_VARIABLE_DEPENDENCIES } from '../pipelineinfo';

const defineNode = (id: string): PipelineNodeInfo => ({
    id,
    type: 'define-feature',
    info: { line: `${id}-header`, postindent: 1 },
});

const operationNode = (id: string, variables?: PipelineNodeInfo['topLevelVariables']): PipelineNodeInfo => ({
    id,
    type: 'custom-feature',
    info: { line: `${id}-body` },
    topLevelVariables: variables,
});

describe('assembleFeatureScriptInfo', () => {
    it('emits each node line once, in flattened order', () => {
        const info = assembleFeatureScriptInfo([
            defineNode('define'),
            operationNode('op'),
            { id: 'output', type: 'output-feature', info: { line: '});', preindent: -1 } },
        ]);

        expect(info.map((item) => item.line)).toEqual(['define-header', 'op-body', '});']);
    });

    it('emits every top-level variable exactly once with multiple define-feature nodes', () => {
        const info = assembleFeatureScriptInfo([
            defineNode('defineA'),
            operationNode('opA', { entities: { identifier: 'entities', featurescript: 'qAllModifiableSolidBodies()' } }),
            defineNode('defineB'),
            operationNode('opB', { other: { identifier: 'other', featurescript: 'qNothing()' } }),
        ]);

        expect(info.map((item) => item.line)).toEqual([
            'defineA-header',
            'var entities = qAllModifiableSolidBodies();',
            'var other = qNothing();',
            'opA-body',
            'defineB-header',
            'opB-body',
        ]);
    });

    it('attaches the query import to each top-level variable and nothing else', () => {
        const info = assembleFeatureScriptInfo([
            defineNode('define'),
            operationNode('op', { entities: { identifier: 'entities', featurescript: 'qAll()' } }),
        ]);

        const vars = info.filter((item) => item.line.startsWith('var '));
        expect(vars).toHaveLength(1);
        expect(vars[0].dependencies).toEqual(TOP_LEVEL_VARIABLE_DEPENDENCIES);
        expect(info.filter((item) => item.line === 'define-header')[0].dependencies).toBeUndefined();
    });

    it('emits no top-level variables when there is no define-feature node', () => {
        const info = assembleFeatureScriptInfo([
            operationNode('op', { entities: { identifier: 'entities', featurescript: 'qAll()' } }),
        ]);

        expect(info.map((item) => item.line)).toEqual(['op-body']);
    });

    it('emits no top-level variables when no node declares any', () => {
        const info = assembleFeatureScriptInfo([defineNode('define'), operationNode('op')]);

        expect(info.map((item) => item.line)).toEqual(['define-header', 'op-body']);
    });
});
