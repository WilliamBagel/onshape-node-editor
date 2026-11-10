import { describe, expect, it } from 'vitest';
import { MathExpressionNode } from '../nodes/mathexpressionnode';
import { validateGraphNodes } from '../graph-validation';
import { NodeEditor } from 'rete';
import { deserializeGraph, serializeGraph } from '../serialization/graph-serializer';
import { toLatex } from '../../onshape-utils/mathexpr';
import { OnshapeSocket } from '../onshapesockets';
import { OnshapeInput } from '../inputoutput/onshapeinput';
import { propagateMathReturnType, syncMathInputType } from '../math-type-propagation';

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

        it('keeps the return output object identity when its type changes', () => {
            const node = new MathExpressionNode('x * 2');
            const output = node.outputs['return'];
            node.applyConnectedInputType('x', { name: 'ValueWithUnits', units: 'millimeter' });
            // A target input's `connections` array holds this object; replacing
            // it makes a later disconnect fail to find the producer.
            expect(node.outputs['return']).toBe(output);
            expect(output.type).toBe('ValueWithUnits (millimeter)');
        });

        it('a consumer can still drop the producer after the producer retyped', () => {
            const node = new MathExpressionNode('x * 2');
            const input = new OnshapeInput(new OnshapeSocket('value', { name: 'unknown' }), 'value', 'unknown');
            input.addConnection(node.outputs['return'] as never);
            expect(input.isConnected()).toBe(true);

            node.applyConnectedInputType('x', { name: 'number' });
            input.removeConnection(node.outputs['return'] as never);

            expect(input.isConnected()).toBe(false);
        });

        it('lets the canvas defer removing a still-connected input', () => {
            const node = new MathExpressionNode('x * 2');
            const removed: string[] = [];
            node.onBeforeInputRemoved = (_node, name) => {
                removed.push(name);
                return true;
            };

            node.setSource('3');

            expect(node.getSourceVariables()).toEqual([]);
            expect(removed).toEqual(['x']);
            // The socket survives until the canvas has disconnected its wire.
            expect(node.inputs['x']).toBeDefined();
            node.removeInput('x');
            expect(node.inputs['x']).toBeUndefined();
        });
    });

    describe('return type propagation', () => {
        const wire = (
            editor: NodeEditor<any>,
            source: MathExpressionNode,
            target: MathExpressionNode,
            id: string,
            targetInput = 'x',
        ) =>
            editor.addConnection({
                id,
                source: source.id,
                sourceOutput: 'return',
                target: target.id,
                targetInput,
            } as never);

        it('follows the first producer and cascades retypes downstream', async () => {
            const editor = new NodeEditor<any>();
            const number = new MathExpressionNode('7');
            const quantity = new MathExpressionNode('7 mm');
            const middle = new MathExpressionNode('x * 2');
            const last = new MathExpressionNode('y * 3');
            for (const node of [number, quantity, middle, last]) await editor.addNode(node as never);
            middle.onReturnTypeChanged = () => propagateMathReturnType(editor, middle);
            last.onReturnTypeChanged = () => propagateMathReturnType(editor, last);

            // Draw the downstream wire first: connection order must not matter.
            await wire(editor, middle, last, 'middle-last', 'y');
            expect(syncMathInputType(editor, middle.id, 'x')).toBe(false);
            expect(last.bindings['y']).toBeUndefined();

            await wire(editor, number, middle, 'number-middle');
            expect(syncMathInputType(editor, middle.id, 'x')).toBe(true);
            expect(middle.getReturnType().name).toBe('number');
            expect(last.bindings['y']).toEqual({ name: 'number' });

            // A second producer must not override the first (data() reads [0]).
            await wire(editor, quantity, middle, 'quantity-middle');
            expect(syncMathInputType(editor, middle.id, 'x')).toBe(false);
            expect(middle.getReturnType().name).toBe('number');

            // Dropping the first producer falls back to the next one.
            await editor.removeConnection('number-middle');
            expect(syncMathInputType(editor, middle.id, 'x')).toBe(true);
            expect(middle.getReturnType().name).toBe('ValueWithUnits');
            expect(last.bindings['y']).toEqual({ name: 'ValueWithUnits', units: 'millimeter' });

            // Dropping the last producer reverts the whole chain to unknown.
            await editor.removeConnection('quantity-middle');
            expect(syncMathInputType(editor, middle.id, 'x')).toBe(true);
            expect(middle.getReturnType().name).toBe('unknown');
            expect(last.bindings['y']).toBeUndefined();
        });

        it('retypes consumers when an upstream source edit changes the return type', async () => {
            const editor = new NodeEditor<any>();
            const source = new MathExpressionNode('7 mm');
            const middle = new MathExpressionNode('x * 2');
            const last = new MathExpressionNode('y * 3');
            for (const node of [source, middle, last]) await editor.addNode(node as never);
            source.onReturnTypeChanged = () => propagateMathReturnType(editor, source);
            middle.onReturnTypeChanged = () => propagateMathReturnType(editor, middle);
            last.onReturnTypeChanged = () => propagateMathReturnType(editor, last);

            await wire(editor, source, middle, 'source-middle');
            await wire(editor, middle, last, 'middle-last', 'y');
            syncMathInputType(editor, middle.id, 'x');
            expect(middle.getReturnType().name).toBe('ValueWithUnits');
            expect(last.bindings['y']).toEqual({ name: 'ValueWithUnits', units: 'millimeter' });

            source.setSource('7');
            expect(middle.getReturnType().name).toBe('number');
            expect(last.bindings['y']).toEqual({ name: 'number' });
        });
    });
});
