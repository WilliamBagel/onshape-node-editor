/**
 * #14 (user-confirmed): each group definition compiles to ONE reusable
 * FeatureScript function; each instance calls it instead of inlining the
 * subgraph. These tests assert the generated text contract: function
 * definitions per definition, calls per instance, and no duplicated
 * member statements per placement.
 *
 * Signature (see groups/group-function.ts, groups/groupmodel.ts):
 * boundary inputs are parameters (typed when a FeatureScript type is
 * known), statement groups get leading `context is Context, id is Id`
 * parameters, one valued output is returned directly, several come back
 * as an untyped map keyed by label and are unpacked as `result["label"]`,
 * and boundary defaults are passed at the call site when unconnected.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import { Connection, Schemes } from "../../types";
import { StyleSettings } from "../../stylesettings";
import { createUtilityNode } from "../../catalog-node-factory";
import { DefineFeatureNode } from "../../nodes/definefeaturenode";
import { OutputFeatureNode } from "../../nodes/outputfeaturenode";
import { FunctionNode } from "../../nodes/functionnode";
import { GroupNode } from "../../nodes/groupinstancenode";
import { OnshapeNode } from "../../nodes/onshapenode";
import { generateFeatureStudioSource } from "../../graph-codegen";
import {
    createGroupDefinition,
    extractBoundarySockets,
    renameGroupSocket,
    setGroupSocketDefault,
    type GroupDefinition,
    type GroupSocketDefinition,
} from "../groupmodel";
import { planGroupFunctions } from "../group-function";

function utility(id: string): FunctionNode {
    const node = createUtilityNode(id);
    if (!(node instanceof FunctionNode)) {
        throw new Error(`expected function node for ${id}`);
    }
    return node;
}

function valueTypeOf(node: FunctionNode, socketKey: string, direction: "input" | "output"): string | undefined {
    const side = direction === "input" ? node.inputs : node.outputs;
    return (side?.[socketKey]?.socket as { valueType?: { name: string } } | undefined)?.valueType?.name;
}

async function connect(
    editor: NodeEditor<Schemes>,
    source: { id: string },
    sourceOutput: string,
    target: { id: string },
    targetInput: string,
    styleSettings: StyleSettings,
): Promise<void> {
    const sourceNode = editor.getNode(source.id) as unknown as OnshapeNode;
    const targetNode = editor.getNode(target.id) as unknown as OnshapeNode;
    await editor.addConnection(new Connection(
        sourceNode,
        sourceOutput,
        (sourceNode.outputs[sourceOutput] as { socket: { name: string } }).socket.name,
        targetNode,
        targetInput,
        (targetNode.inputs[targetInput] as { socket: { name: string } }).socket.name,
        styleSettings,
    ));
}

interface Fixture {
    editor: NodeEditor<Schemes>;
    engine: DataflowEngine<Schemes>;
    styleSettings: StyleSettings;
    define: DefineFeatureNode;
    output: OutputFeatureNode;
    vectorA: FunctionNode;
    vectorB: FunctionNode;
    op1: FunctionNode;
    op2: FunctionNode;
    cross: FunctionNode;
    transform: FunctionNode;
    definition: GroupDefinition;
    instance1: GroupNode;
    instance2: GroupNode;
    bi: string; // instance input socket id (boundary input)
    bo: string; // instance output socket id (boundary output)
}

async function buildFixture(): Promise<Fixture> {
    const editor = new NodeEditor<Schemes>();
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);
    const styleSettings = new StyleSettings();
    const define = new DefineFeatureNode({
        annotation: { type: "Feature Type Name", value: "My New Feature" },
        preconditions: [{ annotation: { type: "Property Function Name", value: "bodies" }, btType: "BTParameterSpecQuery-174" }],
    } as never);
    const output = new OutputFeatureNode();
    const vectorA = utility("vector");
    vectorA.setLiteral("x", "1 * mm");
    vectorA.setLiteral("y", "0 * mm");
    vectorA.setLiteral("z", "0 * mm");
    const vectorB = utility("vector");
    vectorB.setLiteral("x", "0 * mm");
    vectorB.setLiteral("y", "1 * mm");
    vectorB.setLiteral("z", "0 * mm");
    const op1 = createUtilityNode("opTransform") as unknown as FunctionNode;
    const op2 = createUtilityNode("opTransform") as unknown as FunctionNode;
    const cross = utility("cross");
    cross.setLiteral("vector2", "vector(0 * mm, 1 * mm, 0 * mm)");
    const transform = utility("transform");

    const definition = createGroupDefinition("group-cross-transform", "Cross to transform");
    definition.nodes = [cross, transform];
    definition.connections = [{ source: cross.id, sourceOutput: "return", target: transform.id, targetInput: "translation" }];
    const boundary = extractBoundarySockets(
        new Set([cross.id, transform.id]),
        [
            { source: "outside", sourceOutput: "return", target: cross.id, targetInput: "vector1" },
            { source: transform.id, sourceOutput: "return", target: "outside", targetInput: "transform" },
            ...definition.connections,
        ],
        (nodeId, socketKey, direction) => valueTypeOf(nodeId === cross.id ? cross : transform, socketKey, direction),
    );
    definition.inputs = boundary.inputs;
    definition.outputs = boundary.outputs;
    renameGroupSocket(definition, `${cross.id}.vector1`, "inputVector");
    setGroupSocketDefault(definition, `${cross.id}.vector1`, "vector(1 * mm, 0 * mm, 0 * mm)");

    const instance1 = new GroupNode(definition);
    const instance2 = new GroupNode(definition);
    for (const node of [define, output, vectorA, vectorB, op1, op2, instance1, instance2]) {
        await editor.addNode(node);
    }
    const bi = `${cross.id}.vector1`;
    const bo = `${transform.id}.return`;
    await connect(editor, define, "context", op1, "context", styleSettings);
    await connect(editor, define, "definition.bodies", op1, "bodies", styleSettings);
    await connect(editor, vectorA, "return", instance1, bi, styleSettings);
    await connect(editor, instance1, bo, op1, "transform", styleSettings);
    await connect(editor, op1, "context", op2, "context", styleSettings);
    await connect(editor, define, "definition.bodies", op2, "bodies", styleSettings);
    await connect(editor, vectorB, "return", instance2, bi, styleSettings);
    await connect(editor, instance2, bo, op2, "transform", styleSettings);
    await connect(editor, op2, "context", output, "context", styleSettings);
    return { editor, engine, styleSettings, define, output, vectorA, vectorB, op1, op2, cross, transform, definition, instance1, instance2, bi, bo };
}

describe("group -> reusable FeatureScript function (#14)", () => {
    beforeAll(() => {
        vi.spyOn(console, "log").mockImplementation(() => { });
        vi.spyOn(console, "warn").mockImplementation(() => { });
    });

    it("emits one function per definition and one call per instance; members appear once", async () => {
        const fixture = await buildFixture();
        const source = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        expect(source).toBeDefined();
        // One definition.
        expect(source?.match(/function groupCrossToTransform\(/g)).toHaveLength(1);
        // Member statements are not duplicated per placement.
        expect(source?.match(/cross\(/g)).toHaveLength(1);
        expect(source?.match(/transform\(/g)).toHaveLength(1);
        // One call per instance (definition line + 2 calls = 3 mentions).
        expect(source?.match(/groupCrossToTransform\(/g)).toHaveLength(3);
        // The boundary input is a typed parameter; the single output is returned.
        expect(source).toContain("function groupCrossToTransform(inputVector is Vector)");
        expect(source).toMatch(/return v\d+;/);
    });

    it("regenerating the same graph is byte-identical", async () => {
        const fixture = await buildFixture();
        const first = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        const second = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        expect(second).toBe(first);
    });

    it("boundary defaults are passed at the call site when unconnected; wired values win", async () => {
        // Same fixture, but instance1's input is left unconnected.
        const fixture = await buildFixture();
        const editor = fixture.editor;
        const existing = editor.getConnections().find((c) => c.target === fixture.instance1.id);
        if (existing != null) {
            await editor.removeConnection(existing.id);
        }
        const source = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        expect(source).toBeDefined();
        // The default literal is the arg for the unconnected instance...
        expect(source).toContain("groupCrossToTransform(vector(1 * mm, 0 * mm, 0 * mm))");
        // ...while the wired instance passes its producer's value.
        expect(source).not.toContain("groupCrossToTransform(vector(1 * mm, 0 * mm, 0 * mm)), ");
    });

    it("a muted instance emits no call", async () => {
        const fixture = await buildFixture();
        fixture.instance2.muted = true;
        const source = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        expect(source).toBeDefined();
        // Definition + the single non-muted call.
        expect(source?.match(/groupCrossToTransform\(/g)).toHaveLength(2);
        expect(source?.match(/cross\(/g)).toHaveLength(1);
    });

    it("a definition used only by a muted instance emits no function", async () => {
        const fixture = await buildFixture();
        fixture.instance1.muted = true;
        fixture.instance2.muted = true;
        const source = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        expect(source).toBeDefined();
        // No (uncalled) function definition, and no calls.
        expect(source).not.toContain("function groupCrossToTransform");
        expect(source?.match(/cross\(/g) ?? source?.match(/cross/)).toBeNull();
    });

    it("statement groups take context/id parameters and callers pass them", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);
        const styleSettings = new StyleSettings();
        const define = new DefineFeatureNode({
            annotation: { type: "Feature Type Name", value: "My New Feature" },
            preconditions: [{ annotation: { type: "Property Function Name", value: "bodies" }, btType: "BTParameterSpecQuery-174" }],
        } as never);
        const output = new OutputFeatureNode();
        const op = createUtilityNode("opTransform") as unknown as FunctionNode;
        const vector = utility("vector");
        vector.setLiteral("x", "1 * mm");
        vector.setLiteral("y", "0 * mm");
        vector.setLiteral("z", "0 * mm");

        const definition = createGroupDefinition("group-move", "Move bodies");
        definition.nodes = [vector, op];
        definition.connections = [{ source: vector.id, sourceOutput: "return", target: op.id, targetInput: "transform" }];
        // Expose the op's context (statement chain) and bodies query.
        definition.inputs = [
            { id: `${op.id}.context`, label: "context", direction: "input", nodeId: op.id, socketKey: "context", valueType: "Context" },
            { id: `${op.id}.bodies`, label: "bodies", direction: "input", nodeId: op.id, socketKey: "bodies", valueType: "Query" },
        ];
        definition.outputs = [
            { id: `${op.id}.context.out`, label: "context", direction: "output", nodeId: op.id, socketKey: "context", valueType: "Context" },
        ];

        const instance = new GroupNode(definition);
        for (const node of [define, output, instance]) {
            await editor.addNode(node);
        }
        await connect(editor, define, "context", instance, `${op.id}.context`, styleSettings);
        await connect(editor, define, "definition.bodies", instance, `${op.id}.bodies`, styleSettings);
        await connect(editor, instance, `${op.id}.context.out`, output, "context", styleSettings);

        const source = await generateFeatureStudioSource(editor, engine);
        expect(source).toBeDefined();
        expect(source?.match(/function groupMoveBodies\(/g)).toHaveLength(1);
        expect(source).toContain("function groupMoveBodies(context is Context, id is Id, bodies is Query)");
        expect(source?.match(/opTransform\(/g)).toHaveLength(1);
        // Caller passes its own context and id.
        expect(source).toContain("groupMoveBodies(context, id, definition.bodies);");
        // Context flows on by name for the downstream output node.
        expect(source).toMatch(/\n\}\);/);
    });

    it("multiple outputs return a map keyed by label; consumers unpack it", async () => {
        const fixture = await buildFixture();
        // Expose both member outputs.
        fixture.definition.outputs = [
            { id: `${fixture.cross.id}.return`, label: "crossed", direction: "output", nodeId: fixture.cross.id, socketKey: "return", valueType: "Vector" },
            { id: `${fixture.transform.id}.return`, label: "moved", direction: "output", nodeId: fixture.transform.id, socketKey: "return", valueType: "Transform" },
        ];
        fixture.instance1.rebuildSockets();
        fixture.instance2.rebuildSockets();
        // Rewire op1/op2 to consume the "moved" output of their instances via the new socket ids.
        const editor = fixture.editor;
        for (const connection of [...editor.getConnections()]) {
            const feedsOp = connection.target === fixture.op1.id || connection.target === fixture.op2.id;
            const fromInstance = connection.source === fixture.instance1.id || connection.source === fixture.instance2.id;
            if (feedsOp || fromInstance) {
                await editor.removeConnection(connection.id);
            }
        }
        await connect(editor, fixture.define, "context", fixture.op1, "context", fixture.styleSettings);
        await connect(editor, fixture.define, "definition.bodies", fixture.op1, "bodies", fixture.styleSettings);
        await connect(editor, fixture.op1, "context", fixture.op2, "context", fixture.styleSettings);
        await connect(editor, fixture.define, "definition.bodies", fixture.op2, "bodies", fixture.styleSettings);
        await connect(editor, fixture.op2, "context", fixture.output, "context", fixture.styleSettings);
        await connect(editor, fixture.instance1, `${fixture.transform.id}.return`, fixture.op1, "transform", fixture.styleSettings);
        await connect(editor, fixture.instance2, `${fixture.transform.id}.return`, fixture.op2, "transform", fixture.styleSettings);

        const source = await generateFeatureStudioSource(editor, fixture.engine);
        expect(source).toBeDefined();
        // One function; its return is a map with both labels.
        expect(source?.match(/function groupCrossToTransform\(/g)).toHaveLength(1);
        expect(source).toMatch(/return \{ "crossed" : v\d+, "moved" : v\d+ \};/);
        // Result stored once; each consumer unpacks its label.
        expect(source).toMatch(/let groupResult_\S+ = groupCrossToTransform\(/);
        expect(source).toContain('["moved"]');
    });

    it("an instance the pipeline prunes (not reachable from the output) emits no function", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);
        const styleSettings = new StyleSettings();
        const define = new DefineFeatureNode({
            annotation: { type: "Feature Type Name", value: "My New Feature" },
            preconditions: [],
        } as never);
        const output = new OutputFeatureNode();
        const vector = utility("vector");
        vector.setLiteral("x", "1 * mm");
        vector.setLiteral("y", "0 * mm");
        vector.setLiteral("z", "0 * mm");
        const definition = createGroupDefinition("group-vector-only", "Vector only");
        definition.nodes = [vector];
        definition.connections = [];
        definition.inputs = [];
        definition.outputs = [];
        const instance = new GroupNode(definition);
        for (const node of [define, output, instance]) {
            await editor.addNode(node);
        }
        await connect(editor, define, "context", output, "context", styleSettings);

        const source = await generateFeatureStudioSource(editor, engine);
        expect(source).toBeDefined();
        // Consistent with every other node kind: an unreachable node
        // emits nothing — and its (uncalled) function is not emitted.
        expect(source).not.toContain("function groupVectorOnly");
    });

    it("graphs without groups are unchanged", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);
        const styleSettings = new StyleSettings();
        const define = new DefineFeatureNode({
            annotation: { type: "Feature Type Name", value: "My New Feature" },
            preconditions: [{ annotation: { type: "Property Function Name", value: "bodies" }, btType: "BTParameterSpecQuery-174" }],
        } as never);
        const output = new OutputFeatureNode();
        const op = createUtilityNode("opTransform") as unknown as FunctionNode;
        const vector = utility("vector");
        vector.setLiteral("x", "1 * mm");
        vector.setLiteral("y", "0 * mm");
        vector.setLiteral("z", "0 * mm");
        for (const node of [define, output, op, vector]) {
            await editor.addNode(node);
        }
        await connect(editor, define, "context", op, "context", styleSettings);
        await connect(editor, define, "definition.bodies", op, "bodies", styleSettings);
        await connect(editor, vector, "return", op, "transform", styleSettings);
        await connect(editor, op, "context", output, "context", styleSettings);

        const source = await generateFeatureStudioSource(editor, engine);
        expect(source).toBeDefined();
        expect(source).not.toContain("function group");
        expect(source).toContain("export const myNewFeature = defineFeature(function(context is Context, id is Id, definition is map)");
        expect(source).toContain("opTransform(context, id,");
    });

    it("an unsupported member kind falls back to inline expansion, which refuses it", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);
        const styleSettings = new StyleSettings();
        const define = new DefineFeatureNode({
            annotation: { type: "Feature Type Name", value: "My New Feature" },
            preconditions: [],
        } as never);
        const output = new OutputFeatureNode();
        const innerOutput = new OutputFeatureNode();
        const definition = createGroupDefinition("group-bad", "Bad group");
        definition.nodes = [innerOutput];
        definition.outputs = [
            { id: `${innerOutput.id}.context`, label: "context", direction: "output", nodeId: innerOutput.id, socketKey: "context", valueType: "Context" },
        ];
        const instance = new GroupNode(definition);
        for (const node of [define, output, instance]) {
            await editor.addNode(node);
        }
        await connect(editor, instance, `${innerOutput.id}.context`, output, "context", styleSettings);

        expect(planGroupFunctions(editor).supported).toBe(false);
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrow(/output-feature/);
    });
});
