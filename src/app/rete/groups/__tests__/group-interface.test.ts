/**
 * Group interface (Blender-style): drag-to-create placeholder sockets,
 * manual rebinding/unbinding, arbitrary `unknown` interface sockets, and
 * codegen rules for unbound inputs (allowed unused) and outputs (error).
 */
import { describe, expect, it } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import { Connection, Schemes } from "../../types";
import { StyleSettings } from "../../stylesettings";
import { createUtilityNode } from "../../catalog-node-factory";
import { FunctionNode } from "../../nodes/functionnode";
import { buildGroupFunctionInfos, planGroupFunctions } from "../group-function";
import {
    applyGraph,
    deserializeGraph,
    serializeGraph,
} from "../../serialization/graph-serializer";
import { GroupNode } from "../../nodes/groupinstancenode";
import { GroupInputNode, GroupOutputNode, GROUP_INPUT_PLACEHOLDER_KEY, GROUP_OUTPUT_PLACEHOLDER_KEY, GROUP_OUTPUT_PLACEHOLDER_LABEL } from "../../nodes/groupboundarynode";
import { OnshapeInput } from "../../inputoutput/onshapeinput";
import {
    bindGroupSocket,
    createAnyGroupSocket,
    createGroupDefinition,
    isGroupSocketBound,
    unbindGroupSocket,
    type GroupDefinition,
} from "../groupmodel";
import { GroupEditorController } from "../group-editor";

function utility(id: string): FunctionNode {
    const node = createUtilityNode(id);
    if (!(node instanceof FunctionNode)) throw new Error(`expected utility ${id}`);
    return node;
}

interface Fixture {
    editor: NodeEditor<Schemes>;
    engine: DataflowEngine<Schemes>;
    cross: FunctionNode;
    transform: FunctionNode;
    definition: GroupDefinition;
    instance: GroupNode;
    styleSettings: StyleSettings;
}

async function buildFixture(): Promise<Fixture> {
    const editor = new NodeEditor<Schemes>();
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);
    const styleSettings = new StyleSettings();
    const cross = utility("cross");
    cross.setLiteral("vector2", "vector(0 * mm, 1 * mm, 0 * mm)");
    const transform = utility("transform");
    const definition = createGroupDefinition("group-interface-fixture", "Interface fixture");
    definition.nodes = [cross, transform];
    definition.connections = [
        { source: cross.id, sourceOutput: "return", target: transform.id, targetInput: "translation" },
    ];
    definition.inputs = [{ id: `${cross.id}.vector1`, label: "vector1", direction: "input", nodeId: cross.id, socketKey: "vector1", valueType: "Vector" }];
    definition.outputs = [{ id: `${transform.id}.return`, label: "return", direction: "output", nodeId: transform.id, socketKey: "return" }];
    const instance = new GroupNode(definition);
    await editor.addNode(instance);
    return { editor, engine, cross, transform, definition, instance, styleSettings };
}

async function connect(fixture: Fixture, source: { id: string }, sourceOutput: string, target: { id: string }, targetInput: string) {
    const sourceNode = fixture.editor.getNode(source.id) as never;
    const targetNode = fixture.editor.getNode(target.id) as never;
    const connection = new Connection(
        sourceNode,
        sourceOutput,
        (sourceNode as { outputs: Record<string, { socket: { name: string } }> }).outputs[sourceOutput].socket.name,
        targetNode,
        targetInput,
        (targetNode as { inputs: Record<string, { socket: { name: string } }> }).inputs[targetInput].socket.name,
        fixture.styleSettings,
    );
    await fixture.editor.addConnection(connection);
    return connection;
}

async function buildController(fixture: Fixture) {
    const positions: Record<string, { x: number; y: number } | null> = {};
    fixture.editor.getNodes().forEach((node, index) => {
        positions[node.id] = { x: index * 10, y: index * 20 };
    });
    const controller = new GroupEditorController(fixture.editor, {
        snapshot: () => ({ document: JSON.stringify(serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id))), positions: { ...positions } }),
        restore: async (snap) => {
            const loaded = deserializeGraph(JSON.parse(snap.document), { resolveSpec: () => undefined });
            if (!loaded.ok) throw new Error(loaded.error);
            for (const connection of [...fixture.editor.getConnections()]) await fixture.editor.removeConnection(connection.id);
            for (const node of [...fixture.editor.getNodes()]) await fixture.editor.removeNode(node.id);
            await applyGraph(fixture.editor, loaded.graph);
        },
        getPositions: () => ({ ...positions }),
        setPositions: async (next) => { Object.assign(positions, next); },
    });
    expect(await controller.enter(fixture.instance.id)).toBe(true);
    const inputNode = fixture.editor.getNodes().find((node) => node instanceof GroupInputNode) as GroupInputNode;
    const outputNode = fixture.editor.getNodes().find((node) => node instanceof GroupOutputNode) as GroupOutputNode;
    return { controller, inputNode, outputNode };
}

describe("group interface model", () => {
    it("createAnyGroupSocket creates an unbound any-type socket with a unique id", () => {
        const definition = createGroupDefinition("g-any", "Any");
        const first = createAnyGroupSocket(definition, "input", "threshold");
        const second = createAnyGroupSocket(definition, "input", "threshold");
        const typed = createAnyGroupSocket(definition, "output", "result", "Query");
        expect(isGroupSocketBound(first)).toBe(false);
        expect(first.nodeId).toBeUndefined();
        expect(first.socketKey).toBeUndefined();
        expect(first.valueType).toBe("unknown");
        expect(second.id).not.toBe(first.id);
        expect(typed.valueType).toBe("Query");
        expect(definition.inputs).toHaveLength(2);
        expect(definition.outputs).toHaveLength(1);
    });

    it("bind/unbind helpers round-trip", () => {
        const definition = createGroupDefinition("g-bind", "Bind");
        const socket = createAnyGroupSocket(definition, "input", "value");
        expect(bindGroupSocket(definition, socket.id, "n1", "value", "input")).toBe(true);
        expect(isGroupSocketBound(socket)).toBe(true);
        expect(socket.nodeId).toBe("n1");
        expect(unbindGroupSocket(definition, socket.id, "input")).toBe(true);
        expect(isGroupSocketBound(socket)).toBe(false);
        expect(bindGroupSocket(definition, "missing", "n1", "value")).toBe(false);
    });

    it("serialization round-trip keeps optional bindings, placeholder never saved", async () => {
        const fixture = await buildFixture();
        const unbound = createAnyGroupSocket(fixture.definition, "input", "extra", "unknown");
        const document = serializeGraph(fixture.editor, {}, [fixture.instance.id]) as unknown as {
            groupDefinitions: { inputs: Record<string, unknown>[] }[];
        };
        const saved = document.groupDefinitions[0].inputs.find((socket) => socket.id === unbound.id);
        expect(saved).toBeDefined();
        expect(saved?.nodeId).toBeUndefined();
        expect(saved?.socketKey).toBeUndefined();
        const loaded = deserializeGraph(JSON.parse(JSON.stringify(document)), { resolveSpec: () => undefined });
        if (!loaded.ok) throw new Error(loaded.error);
        const restored = loaded.graph.groupDefinitions[0].inputs.find((socket) => socket.id === unbound.id);
        expect(restored).toBeDefined();
        expect(isGroupSocketBound(restored!)).toBe(false);
    });
});

describe("group interface drag behaviour", () => {
    it("boundary cards carry placeholder sockets that are not saved interface sockets", async () => {
        const fixture = await buildFixture();
        const { inputNode, outputNode } = await buildController(fixture);
        expect(Object.keys(inputNode.outputs)).toContain(GROUP_INPUT_PLACEHOLDER_KEY);
        expect(Object.keys(outputNode.inputs)).toContain(GROUP_OUTPUT_PLACEHOLDER_KEY);
        // The End card must render its label/port the same way a feature
        // input does; a bare ClassicPreset.Input rendered as a blank card.
        const placeholder = outputNode.inputs[GROUP_OUTPUT_PLACEHOLDER_KEY] as unknown as OnshapeInput<never>;
        expect(placeholder).toBeInstanceOf(OnshapeInput);
        expect(placeholder.label).toBe(GROUP_OUTPUT_PLACEHOLDER_LABEL);
        expect(placeholder.showControl).toBe(false);
        expect(placeholder.showLabel).toBe(true);
        expect(fixture.definition.inputs.some((socket) => socket.id === GROUP_INPUT_PLACEHOLDER_KEY)).toBe(false);
        expect(fixture.definition.outputs.some((socket) => socket.id === GROUP_OUTPUT_PLACEHOLDER_KEY)).toBe(false);
    });

    it("dragging the Start placeholder creates a bound interface input and a real wire", async () => {
        const fixture = await buildFixture();
        const { inputNode } = await buildController(fixture);
        await connect(fixture, inputNode, GROUP_INPUT_PLACEHOLDER_KEY, fixture.cross, "vector2");
        const created = fixture.definition.inputs.find((socket) => socket.nodeId === fixture.cross.id && socket.socketKey === "vector2");
        expect(created).toBeDefined();
        expect(created!.label).toBe("vector2");
        // Placeholder remains for another drag.
        expect(Object.keys(inputNode.outputs)).toContain(GROUP_INPUT_PLACEHOLDER_KEY);
        // The temporary wire is replaced by the real boundary wire.
        const wires = fixture.editor.getConnections()
            .filter((connection) => connection.source === inputNode.id);
        expect(wires.some((connection) => connection.sourceOutput === GROUP_INPUT_PLACEHOLDER_KEY)).toBe(false);
        expect(wires.some((connection) => connection.sourceOutput === created!.id && connection.targetInput === "vector2")).toBe(true);
    });

    it("dragging a member output into the End placeholder creates a bound output", async () => {
        const fixture = await buildFixture();
        // Remove the existing output socket so the placeholder drag is the only source.
        fixture.definition.outputs = [];
        const { outputNode } = await buildController(fixture);
        await connect(fixture, fixture.cross, "return", outputNode, GROUP_OUTPUT_PLACEHOLDER_KEY);
        const created = fixture.definition.outputs.find((socket) => socket.nodeId === fixture.cross.id && socket.socketKey === "return");
        expect(created).toBeDefined();
        expect(Object.keys(outputNode.inputs)).toContain(GROUP_OUTPUT_PLACEHOLDER_KEY);
        const wires = fixture.editor.getConnections()
            .filter((connection) => connection.target === outputNode.id);
        expect(wires.some((connection) => connection.targetInput === GROUP_OUTPUT_PLACEHOLDER_KEY)).toBe(false);
        expect(wires.some((connection) => connection.targetInput === created!.id && connection.sourceOutput === "return")).toBe(true);
    });

    it("dragging an existing Start output to another member input rebinds it", async () => {
        const fixture = await buildFixture();
        const { inputNode } = await buildController(fixture);
        const socket = fixture.definition.inputs[0];
        expect(socket.nodeId).toBe(fixture.cross.id);
        await connect(fixture, inputNode, socket.id, fixture.transform, "translation");
        expect(socket.nodeId).toBe(fixture.transform.id);
        expect(socket.socketKey).toBe("translation");
    });

    it("removing the old wire after a rebind does not unbind the new binding", async () => {
        const fixture = await buildFixture();
        const { inputNode } = await buildController(fixture);
        const socket = fixture.definition.inputs[0];
        // The pre-existing wire Start -> cross.vector1, created on group entry.
        const original = fixture.editor.getConnections()
            .find((connection) => connection.source === inputNode.id && connection.sourceOutput === socket.id);
        expect(original).toBeDefined();
        expect(original!.target).toBe(fixture.cross.id);
        // Drag the Start output to a different member input: rebinds.
        const moved = await connect(fixture, inputNode, socket.id, fixture.transform, "translation");
        expect(socket.nodeId).toBe(fixture.transform.id);
        // Removing the old wire must not unbind the new binding.
        await fixture.editor.removeConnection(original!.id);
        expect(isGroupSocketBound(socket)).toBe(true);
        expect(socket.nodeId).toBe(fixture.transform.id);
        await fixture.editor.removeConnection(moved.id);
        // Removing the *current* binding wire does unbind.
        expect(isGroupSocketBound(socket)).toBe(false);
        expect(fixture.definition.inputs).toContain(socket);
    });

    it("disconnecting a boundary wire unbinds the socket but keeps it", async () => {
        const fixture = await buildFixture();
        const { inputNode } = await buildController(fixture);
        const wire = fixture.editor.getConnections().find((connection) => connection.source === inputNode.id);
        expect(wire).toBeDefined();
        await fixture.editor.removeConnection(wire!.id);
        const socket = fixture.definition.inputs[0];
        expect(isGroupSocketBound(socket)).toBe(false);
        expect(socket.nodeId).toBeUndefined();
        expect(Object.keys(inputNode.outputs)).toContain(socket.id);
    });

    it("refresh restores exactly the saved boundary connections (no destructive rebuild)", async () => {
        const fixture = await buildFixture();
        const { controller, inputNode } = await buildController(fixture);
        await connect(fixture, inputNode, GROUP_INPUT_PLACEHOLDER_KEY, fixture.cross, "vector2");
        await controller.refreshBoundary();
        const socket = fixture.definition.inputs.find((entry) => entry.socketKey === "vector2");
        expect(socket).toBeDefined();
        expect(isGroupSocketBound(socket!)).toBe(true);
        const wire = fixture.editor.getConnections()
            .find((connection) => connection.source === inputNode.id && connection.sourceOutput === socket!.id);
        expect(wire).toBeDefined();
        expect(wire!.targetInput).toBe("vector2");
    });

    it("panel add-any creates an unbound socket on the card", async () => {
        const fixture = await buildFixture();
        const { controller, inputNode } = await buildController(fixture);
        expect(await controller.addBoundarySocketAny("input", "threshold", "unknown")).toBe(true);
        const socket = fixture.definition.inputs.find((entry) => entry.label === "threshold");
        expect(socket).toBeDefined();
        expect(isGroupSocketBound(socket!)).toBe(false);
        expect(Object.keys(inputNode.outputs)).toContain(socket!.id);
    });
});

describe("group interface codegen", () => {
    it("an unbound input is allowed unused; an unbound output is a clear build error", async () => {
        const fixture = await buildFixture();
        createAnyGroupSocket(fixture.definition, "input", "unusedInput", "unknown");
        const plan = planGroupFunctions(fixture.editor);
        const lines = buildGroupFunctionInfos(plan).map((info) => info.line).join("\n");
        expect(lines).toContain("unusedInput");

        const bad = await buildFixture();
        unbindGroupSocket(bad.definition, bad.definition.outputs[0].id, "output");
        expect(() => buildGroupFunctionInfos(planGroupFunctions(bad.editor))).toThrow(/not bound to a member output/);
    });
});
