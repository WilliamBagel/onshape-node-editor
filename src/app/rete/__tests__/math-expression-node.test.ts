import { describe, expect, it } from 'vitest';
import { MathExpressionNode } from '../nodes/mathexpressionnode';
import { validateGraphNodes } from '../graph-validation';
import { NodeEditor } from 'rete';
import { deserializeGraph, serializeGraph } from '../serialization/graph-serializer';
import { toLatex } from '../../onshape-utils/mathexpr';
import { OnshapeSocket } from '../onshapesockets';

describe('MathExpressionNode', () => {
    it('2 * PI * r: r becomes a socket, PI stays inline', () => {
        const node = new MathExpressionNode('2 * PI * r');
        expect(node.isValid).toBe(true);
        expect(node.getFreeVariables()).toEqual(['r']);
        expect(node.inputs['r']).toBeDefined();
        expect(node.inputs['PI']).toBeUndefined();
        expect(node.outputs['return']).toBeDefined();
        const compiled = node.getCompiled();
        expect(compiled?.ok).toBe(true);
        if (compiled?.ok) expect(compiled.code).toContain('PI');
    });

    it('removes sockets for variables that leave the source', () => {
        const node = new MathExpressionNode('a + b');
        expect(node.getFreeVariables()).toEqual(['a', 'b']);
        node.setSource('a + 1');
        expect(node.getFreeVariables()).toEqual(['a']);
        expect(node.inputs['b']).toBeUndefined();
    });

    it('invalid expression: diagnostics, span, hover message, content kept', () => {
        const node = new MathExpressionNode('r +');
        expect(node.isValid).toBe(false);
        expect(node.source).toBe('r +');
        expect(node.diagnostics.length).toBeGreaterThan(0);
        expect(node.errorSpan).toBeDefined();
        expect(node.errorMessage).toContain('r');
        expect(node.getLatex()).toBeUndefined();
    });

    it('invalid edit keeps the last good sockets', () => {
        const node = new MathExpressionNode('a + b');
        node.setSource('a + * b');
        expect(node.isValid).toBe(false);
        expect(node.source).toBe('a + * b');
        expect(node.getFreeVariables()).toEqual(['a', 'b']);
    });

    it('build is blocked naming the node', () => {
        const node = new MathExpressionNode('sin(30)');
        expect(node.isValid).toBe(false);
        expect(() =>
            validateGraphNodes([{ node, producers: {} }], () => node),
        ).toThrow(/math-expression/);
        expect(() =>
            validateGraphNodes([{ node, producers: {} }], () => node),
        ).toThrow(/sin\(30\).*is invalid/);
    });

    it('collapsed title shows the typeset expression', () => {
        const node = new MathExpressionNode('2 * PI * r');
        expect(node.getTitle()).toBe('Math expression');
        node.setCollapsed(true);
        const compiled = node.getCompiled();
        expect(compiled?.ok).toBe(true);
        if (compiled?.ok) {
            expect(node.getTitle()).toBe(toLatex(compiled.ast));
            expect(node.getTitle()).toContain('\\pi');
        }
    });

    it('serialization round-trip stores only source + bindings', () => {
        const node = new MathExpressionNode('2 * PI * r');
        node.setBinding('r', { name: 'number' });
        const json = node.toJSON();
        expect(json.kind).toBe('math-expression');
        expect(json.source).toBe('2 * PI * r');
        expect(json.bindings).toEqual({ r: { name: 'number' } });
        expect('diagnostics' in json).toBe(false);
        expect('latex' in json).toBe(false);
        const restored = MathExpressionNode.fromJSON(json);
        expect(restored.source).toBe('2 * PI * r');
        expect(restored.bindings).toEqual({ r: { name: 'number' } });
        expect(restored.isValid).toBe(true);
        expect(restored.getFreeVariables()).toEqual(['r']);
    });

    it('graph serialization round-trip through the serializer', async () => {
        const editor = new NodeEditor<any>();
        const node = new MathExpressionNode('2 * PI * r');
        await editor.addNode(node as any);
        const serialized = serializeGraph(editor as any);
        const json = JSON.parse(JSON.stringify(serialized));
        expect(json.nodes.map((n: any) => n.kind)).toContain('math-expression');
        const result = deserializeGraph(json, {});
        expect(result.ok).toBe(true);
        if (result.ok) {
            const restored = result.graph.nodes.find((n) => n.type === 'math-expression');
            expect(restored).toBeInstanceOf(MathExpressionNode);
            expect((restored as MathExpressionNode).source).toBe('2 * PI * r');
            expect((restored as MathExpressionNode).getFreeVariables()).toEqual(['r']);
        }
    });

    it('expression info carries the FeatureScript and the inferred type', () => {
        const node = new MathExpressionNode('x * 2');
        const info = node.getExpressionInfo({
            variableMapping: {},
            inputProducers: { x: 'producer-x' },
        });
        expect(info?.expression).toContain('*');
        expect(info?.inputs?.['x']).toBe('producer-x');
        expect(info?.pure).toBe(true);
    });

    describe('input type propagation', () => {
        const socketType = (node: MathExpressionNode, key: string) =>
            (node.inputs[key].socket as OnshapeSocket).valueType;
        const returnType = (node: MathExpressionNode) =>
            (node.outputs['return'].socket as OnshapeSocket).valueType;

        it('a connected quantity retypes the return socket (x * 2 -> ValueWithUnits)', () => {
            const node = new MathExpressionNode('x * 2');
            expect(returnType(node).name).toBe('unknown');

            node.applyConnectedInputType('x', { name: 'ValueWithUnits', units: 'millimeter' });

            expect(node.bindings['x']).toEqual({ name: 'ValueWithUnits', units: 'millimeter' });
            expect(returnType(node).name).toBe('ValueWithUnits');
            expect(node.getReturnType().name).toBe('ValueWithUnits');
            const compiled = node.getCompiled();
            expect(compiled?.ok).toBe(true);
            if (compiled?.ok) expect(compiled.valueType.name).toBe('ValueWithUnits');
        });

        it('the input socket stays permissive (unknown) after binding', () => {
            const node = new MathExpressionNode('x * 2');
            node.applyConnectedInputType('x', { name: 'ValueWithUnits', units: 'millimeter' });
            // Binding feeds the type checker only: any compatible producer
            // value must still be able to connect to the input port.
            expect(socketType(node, 'x').name).toBe('unknown');
        });

        it('a connected number gives a number result', () => {
            const node = new MathExpressionNode('x * 2');
            node.applyConnectedInputType('x', { name: 'number' });
            expect(node.bindings['x']).toEqual({ name: 'number' });
            expect(returnType(node).name).toBe('number');
        });

        it('disconnecting clears the binding and the recomputed return type', () => {
            const node = new MathExpressionNode('x * 2');
            node.applyConnectedInputType('x', { name: 'ValueWithUnits', units: 'millimeter' });
            expect(returnType(node).name).toBe('ValueWithUnits');

            node.clearConnectedInputType('x');

            expect(node.bindings['x']).toBeUndefined();
            expect(returnType(node).name).toBe('unknown');
        });

        it('an untyped producer does not create a binding', () => {
            const node = new MathExpressionNode('x * 2');
            node.applyConnectedInputType('x', { name: 'unknown' });
            expect(node.bindings['x']).toBeUndefined();
            expect(returnType(node).name).toBe('unknown');
        });

        it('ignores a type for a variable that has no socket', () => {
            const node = new MathExpressionNode('x * 2');
            node.applyConnectedInputType('missing', { name: 'number' });
            expect(node.bindings['missing']).toBeUndefined();
        });

        it('notifies the editor when a source edit retypes a live return socket', () => {
            const node = new MathExpressionNode('5 mm');
            const seen: string[] = [];
            node.onReturnTypeChange = (_node, valueType) => seen.push(valueType.name);

            node.setSource('2');
            expect(seen).toEqual(['number']);

            node.setSource('3');
            expect(seen).toEqual(['number']);

            node.setSource('5 mm');
            expect(seen).toEqual(['number', 'ValueWithUnits']);
        });
    });
});
