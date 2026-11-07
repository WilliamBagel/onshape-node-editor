/**
 * #14 grouping v2: a two-node subgraph is grouped, exposed, placed twice,
 * saved/loaded, and generates valid FeatureScript; entering/leaving a group
 * preserves positions and connections; a nesting cycle is rejected.
 */
import { describe, expect, it } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import { Connection, Schemes } from "../../types";
import { StyleSettings } from "../../stylesettings";
import { createUtilityNode } from "../../catalog-node-factory";
import { DefineFeatureNode } from "../../nodes/definefeaturenode";
import { OutputFeatureNode } from "../../nodes/outputfeaturenode";
import { FunctionNode } from "../../nodes/functionnode";
import { generateFeatureStudioSource } from "../../graph-codegen";
import {
    applyGraph,
    deserializeGraph,
    serializeGraph,
} from "../../serialization/graph-serializer";
import { GroupNode } from "../../nodes/groupinstancenode";
import { GroupInputNode, GroupOutputNode } from "../../nodes/groupboundarynode";
import {
    createGroupDefinition,
    extractBoundarySockets,
    findGroupCycle,
    renameGroupSocket,
    reorderGroupSockets,
    setGroupSocketDefault,
    wouldCreateGroupCycle,
    type GroupDefinition,
} from "../groupmodel";
import { GroupEditorController } from "../group-editor";

function utility(id: string): FunctionNode {
    const node = createUtilityNode(id);
    if (!(node instanceof FunctionNode)) {
        throw new Error(`expected a function node for ${id}`);
    }
    return node;
}

interface Fixture {
    editor: NodeEditor<Schemes>;
    engine: DataflowEngine<Schemes>;
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
}

/** Cross + transform as one group, placed twice in a define→op→op→output chain. */
async function buildFixture(): Promise<Fixture> {
    const editor = new NodeEditor<Schemes>();
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);
    const styleSettings = new StyleSettings();

    const define = new DefineFeatureNode({
        annotation: { type: "Feature Type Name", value: "My New Feature" },
        preconditions: [
            { annotation: { type: "Property Function Name", value: "bodies" }, btType: "BTParameterSpecQuery-174" },
        ],
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
    const op1Node = createUtilityNode("opTransform");
    const op2Node = createUtilityNode("opTransform");
    if (op1Node == null || op2Node == null) {
        throw new Error("expected opTransform utility nodes");
    }
    const op1 = op1Node as unknown as FunctionNode;
    const op2 = op2Node as unknown as FunctionNode;

    // The two-node subgraph: cross(vector1, vector2) -> transform.
    const cross = utility("cross");
    cross.setLiteral("vector2", "vector(0 * mm, 1 * mm, 0 * mm)");
    const transform = utility("transform");
    const definition = createGroupDefinition("group-cross-transform", "Cross to transform");
    definition.nodes = [cross, transform];
    definition.connections = [
        { source: cross.id, sourceOutput: "return", target: transform.id, targetInput: "translation" },
    ];
    const boundary = extractBoundarySockets(
        new Set([cross.id, transform.id]),
        [
            { source: "outside", sourceOutput: "return", target: cross.id, targetInput: "vector1" },
            { source: transform.id, sourceOutput: "return", target: "outside", targetInput: "transform" },
            ...definition.connections,
        ],
        (nodeId, socketKey, direction) => {
            const node = nodeId === cross.id ? cross : transform;
            const side = direction === "input" ? node.inputs : node.outputs;
            return (side?.[socketKey]?.socket as { valueType?: { name: string } } | undefined)?.valueType?.name;
        },
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
    const connect = async (source: { id: string }, sourceOutput: string, target: { id: string }, targetInput: string) => {
        const sourceNode = editor.getNode(source.id) as never;
        const targetNode = editor.getNode(target.id) as never;
        const connection = new Connection(
            sourceNode,
            sourceOutput,
            (sourceNode as { outputs: Record<string, { socket: { name: string } }> }).outputs[sourceOutput].socket.name,
            targetNode,
            targetInput,
            (targetNode as { inputs: Record<string, { socket: { name: string } }> }).inputs[targetInput].socket.name,
            styleSettings,
        );
        await editor.addConnection(connection);
    };

    const boundaryInput = `${cross.id}.vector1`;
    const boundaryOutput = `${transform.id}.return`;
    await connect(define, "context", op1, "context");
    await connect(define, "definition.bodies", op1, "bodies");
    await connect(vectorA, "return", instance1, boundaryInput);
    await connect(instance1, boundaryOutput, op1, "transform");
    await connect(op1, "context", op2, "context");
    await connect(define, "definition.bodies", op2, "bodies");
    await connect(vectorB, "return", instance2, boundaryInput);
    await connect(instance2, boundaryOutput, op2, "transform");
    await connect(op2, "context", output, "context");

    return { editor, engine, define, output, vectorA, vectorB, op1, op2, cross, transform, definition, instance1, instance2 };
}

describe("grouping v2 (#14)", () => {
    it("instances expose renamed boundary sockets in definition order", async () => {
        const fixture = await buildFixture();
        expect(Object.keys(fixture.instance1.inputs)).toEqual([`${fixture.cross.id}.vector1`]);
        expect(fixture.instance1.inputs[`${fixture.cross.id}.vector1`].socket.name).toBe("inputVector");
        expect(Object.keys(fixture.instance1.outputs)).toEqual([`${fixture.transform.id}.return`]);
        expect(fixture.instance1.definitionId).toBe("group-cross-transform");
    });

    it("a two-node subgraph, placed twice, generates inlined FeatureScript", async () => {
        const fixture = await buildFixture();
        const source = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        expect(source).toBeDefined();
        // Inlined once per placement: cross and transform each appear twice.
        expect(source?.match(/cross\(/g)).toHaveLength(2);
        expect(source?.match(/transform\(/g)).toHaveLength(2);
        expect(source).toContain("opTransform");
    });

    it("definitions are stored once and instances reference them by id across a round-trip", async () => {
        const fixture = await buildFixture();
        const original = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        const document = serializeGraph(fixture.editor, {}, fixture.editor.getNodes().map((node) => node.id)) as {
            groupDefinitions: { id: string; nodes: unknown[] }[];
            nodes: { kind: string; definitionId?: string }[];
        };
        expect(document.groupDefinitions).toHaveLength(1);
        expect(document.groupDefinitions[0].id).toBe("group-cross-transform");
        expect(document.groupDefinitions[0].nodes).toHaveLength(2);
        const instances = document.nodes.filter((node) => node.kind === "group-instance");
        expect(instances).toHaveLength(2);
        for (const instance of instances) {
            expect(instance.definitionId).toBe("group-cross-transform");
        }

        const loaded = deserializeGraph(document, { resolveSpec: () => undefined });
        if (!loaded.ok) {
            throw new Error(loaded.error);
        }
        expect(loaded.graph.groupDefinitions).toHaveLength(1);
        expect(loaded.graph.groupDefinitions[0].nodes.map((node) => node.type).sort()).toEqual(["function", "function"]);

        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);
        await applyGraph(editor, loaded.graph);
        const reloaded = await generateFeatureStudioSource(editor, engine);
        expect(reloaded).toBe(original);
    });

    it("rename, reorder and defaults survive serialization", async () => {
        const fixture = await buildFixture();
        setGroupSocketDefault(fixture.definition, `${fixture.cross.id}.vector1`, "vector(9 * mm, 0 * mm, 0 * mm)");
        reorderGroupSockets(fixture.definition, "input", []);
        const document = serializeGraph(fixture.editor, {}, fixture.editor.getNodes().map((node) => node.id)) as {
            groupDefinitions: { inputs: { id: string; label: string; defaultLiteral?: string }[] }[];
        };
        expect(document.groupDefinitions[0].inputs[0].label).toBe("inputVector");
        expect(document.groupDefinitions[0].inputs[0].defaultLiteral).toBe("vector(9 * mm, 0 * mm, 0 * mm)");
    });

    it("entering and leaving a group preserves positions and connections", async () => {
        const fixture = await buildFixture();
        const positions: Record<string, { x: number; y: number } | null> = {};
        fixture.editor.getNodes().forEach((node, index) => {
            positions[node.id] = { x: index * 10, y: index * 20 };
        });
        const beforeConnections = JSON.stringify(serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id)));

        const controller = new GroupEditorController(fixture.editor, {
            snapshot: () => ({
                document: JSON.stringify(serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id))),
                positions: { ...positions },
            }),
            restore: async (snap) => {
                const loaded = deserializeGraph(JSON.parse(snap.document), { resolveSpec: () => undefined });
                if (!loaded.ok) {
                    throw new Error(loaded.error);
                }
                for (const connection of [...fixture.editor.getConnections()]) {
                    await fixture.editor.removeConnection(connection.id);
                }
                for (const node of [...fixture.editor.getNodes()]) {
                    await fixture.editor.removeNode(node.id);
                }
                await applyGraph(fixture.editor, loaded.graph);
            },
            getPositions: () => ({ ...positions }),
            setPositions: async (next) => {
                Object.assign(positions, next);
            },
        });

        expect(await controller.enter(fixture.instance1.id)).toBe(true);
        expect(controller.breadcrumb()).toEqual(["Top level", "Cross to transform"]);
        // Inside: the member nodes plus the visible Start Feature / End Feature
        // boundary cards. Boundary wiring is created for each exposed socket.
        const insideIds = fixture.editor.getNodes().map((node) => node.id).sort();
        expect(insideIds).toContain(fixture.cross.id);
        expect(insideIds).toContain(fixture.transform.id);
        expect(fixture.editor.getNodes().some((node) => node instanceof GroupInputNode && node.getTitle() === "Start Feature")).toBe(true);
        expect(fixture.editor.getNodes().some((node) => node instanceof GroupOutputNode && node.getTitle() === "End Feature")).toBe(true);
        expect(fixture.editor.getConnections()).toHaveLength(3);

        // Move a member while inside; the new position is captured on exit.
        positions[fixture.cross.id] = { x: 777, y: 888 };
        expect(await controller.exit()).toBe(true);
        expect(controller.breadcrumb()).toEqual(["Top level"]);
        expect(fixture.definition.positions[fixture.cross.id]).toEqual({ x: 777, y: 888 });

        const afterDoc = serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id)) as { connections: unknown[]; nodes: { id: string }[] };
        const beforeDoc = JSON.parse(beforeConnections) as { connections: unknown[]; nodes: { id: string }[] };
        expect(afterDoc.connections).toEqual(beforeDoc.connections);
        expect(afterDoc.nodes.map((node) => node.id).sort()).toEqual(beforeDoc.nodes.map((node) => node.id).sort());
        // Outside positions are untouched by the visit.
        expect(positions[fixture.define.id]).toEqual({ x: 0, y: 0 });
    });

    it("an instance can be entered, exited, and entered again (Tab round-trip)", async () => {
        const fixture = await buildFixture();
        const positions: Record<string, { x: number; y: number } | null> = {};
        fixture.editor.getNodes().forEach((node, index) => {
            positions[node.id] = { x: index * 10, y: index * 20 };
        });
        const controller = new GroupEditorController(fixture.editor, {
            snapshot: () => ({
                document: JSON.stringify(serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id))),
                positions: { ...positions },
            }),
            restore: async (snap) => {
                const loaded = deserializeGraph(JSON.parse(snap.document), { resolveSpec: () => undefined });
                if (!loaded.ok) throw new Error(loaded.error);
                for (const connection of [...fixture.editor.getConnections()]) {
                    await fixture.editor.removeConnection(connection.id);
                }
                for (const node of [...fixture.editor.getNodes()]) {
                    await fixture.editor.removeNode(node.id);
                }
                await applyGraph(fixture.editor, loaded.graph);
            },
            getPositions: () => ({ ...positions }),
            setPositions: async (next) => { Object.assign(positions, next); },
        });

        const outerBefore = serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id));
        for (let round = 0; round < 2; round++) {
            const instanceId = fixture.editor.getNodes().find((node) => node instanceof GroupNode)?.id;
            expect(instanceId).toBeTruthy();
            expect(await controller.toggle(instanceId)).toBe("entered");
            expect(controller.breadcrumb()).toEqual(["Top level", "Cross to transform"]);
            expect(fixture.editor.getNodes().map((node) => node.id)).toContain(fixture.cross.id);
            expect(fixture.editor.getNodes().map((node) => node.id)).toContain(fixture.transform.id);
            expect(fixture.editor.getNodes().some((node) => node instanceof GroupInputNode)).toBe(true);
            expect(fixture.editor.getNodes().some((node) => node instanceof GroupOutputNode)).toBe(true);
            expect(await controller.toggle()).toBe("exited");
            expect(controller.breadcrumb()).toEqual(["Top level"]);
        }
        const outerAfter = serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id));
        expect(outerAfter.connections).toEqual(outerBefore.connections);
        expect(outerAfter.nodes.map((node) => node.id).sort()).toEqual(outerBefore.nodes.map((node) => node.id).sort());
        expect(outerAfter.groupDefinitions).toEqual(outerBefore.groupDefinitions);
    });

    it("a muted instance is skipped by codegen", async () => {
        const fixture = await buildFixture();
        fixture.instance2.muted = true;
        const source = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        expect(source?.match(/cross\(/g)).toHaveLength(1);
        expect(source?.match(/transform\(/g)).toHaveLength(1);
    });

    it("a nesting cycle is rejected", async () => {
        const a = createGroupDefinition("group-a", "A");
        const b = createGroupDefinition("group-b", "B");
        const innerB = new GroupNode(b);
        const innerA = new GroupNode(a);
        a.nodes = [innerB];
        b.nodes = [innerA];
        const definitions = new Map([["group-a", a], ["group-b", b]]);
        expect(findGroupCycle(definitions, "group-a")).toEqual(["group-a", "group-b", "group-a"]);
        expect(wouldCreateGroupCycle(definitions, "group-a", "group-b")).toBe(true);
        expect(wouldCreateGroupCycle(definitions, "group-a", "group-a")).toBe(true);

        // And a cyclic document refuses to load.
        const bad = {
            schemaVersion: 2,
            nodes: [],
            connections: [],
            nodeOrder: [],
            groupDefinitions: [
                {
                    id: "group-a",
                    name: "A",
                    nodes: [{ kind: "group-instance", id: "n-b", title: "B", position: null, size: { width: 100, height: 100 }, group: null, definitionId: "group-b" }],
                    connections: [],
                    inputs: [],
                    outputs: [],
                },
                {
                    id: "group-b",
                    name: "B",
                    nodes: [{ kind: "group-instance", id: "n-a", title: "A", position: null, size: { width: 100, height: 100 }, group: null, definitionId: "group-a" }],
                    connections: [],
                    inputs: [],
                    outputs: [],
                },
            ],
        };
        const loaded = deserializeGraph(bad, { resolveSpec: () => undefined });
        expect(loaded.ok).toBe(false);
        if (!loaded.ok) {
            expect(loaded.error).toContain("cycle");
        }
    });

    it("groups nest: a group inside a group inlines recursively", async () => {
        const fixture = await buildFixture();
        // Wrap the whole graph's instances in an outer group definition
        // whose members are the two instances, exposed end to end.
        const outer = createGroupDefinition("group-outer", "Outer");
        outer.nodes = [fixture.instance1, fixture.instance2];
        // Chain the inner instances: instance1's transform feeds instance2's vector.
        outer.connections = [{
            source: fixture.instance1.id,
            sourceOutput: `${fixture.transform.id}.return`,
            target: fixture.instance2.id,
            targetInput: `${fixture.cross.id}.vector1`,
        }];
        outer.inputs = [{ id: `${fixture.instance1.id}.in`, label: "in", direction: "input", nodeId: fixture.instance1.id, socketKey: `${fixture.cross.id}.vector1` }];
        outer.outputs = [{ id: `${fixture.instance2.id}.out`, label: "out", direction: "output", nodeId: fixture.instance2.id, socketKey: `${fixture.transform.id}.return` }];
        const outerInstance = new GroupNode(outer);

        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);
        const styleSettings = new StyleSettings();
        for (const node of [fixture.define, fixture.output, fixture.vectorA, fixture.vectorB, fixture.op1, outerInstance]) {
            await editor.addNode(node);
        }
        const connect = async (sourceId: string, sourceOutput: string, targetId: string, targetInput: string) => {
            const sourceNode = editor.getNode(sourceId) as never;
            const targetNode = editor.getNode(targetId) as never;
            const connection = new Connection(
                sourceNode,
                sourceOutput,
                (sourceNode as { outputs: Record<string, { socket: { name: string } }> }).outputs[sourceOutput].socket.name,
                targetNode,
                targetInput,
                (targetNode as { inputs: Record<string, { socket: { name: string } }> }).inputs[targetInput].socket.name,
                styleSettings,
            );
            await editor.addConnection(connection);
        };
        await connect(fixture.define.id, "context", fixture.op1.id, "context");
        await connect(fixture.define.id, "definition.bodies", fixture.op1.id, "bodies");
        await connect(fixture.vectorA.id, "return", outerInstance.id, `${fixture.instance1.id}.in`);
        await connect(outerInstance.id, `${fixture.instance2.id}.out`, fixture.op1.id, "transform");
        await connect(fixture.op1.id, "context", fixture.output.id, "context");

        const source = await generateFeatureStudioSource(editor, engine);
        expect(source).toBeDefined();
        // The outer group inlines both inner instances: two crosses in total.
        expect(source?.match(/cross\(/g)).toHaveLength(2);
    });

    it("exposes boundary sockets and lets the editor add, rename, retype and remove them", async () => {
        const fixture = await buildFixture();
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
        expect(await controller.enter(fixture.instance1.id)).toBe(true);
        const state = controller.boundaryState();
        expect(state?.name).toBe("Cross to transform");
        expect(state?.candidates?.inputs.some((candidate) => candidate.socketKey === "vector2")).toBe(true);
        expect(await controller.addBoundarySocket("input", fixture.cross.id, "vector2")).toBe(true);
        const added = fixture.definition.inputs.find((socket) => socket.socketKey === "vector2");
        expect(added).toBeDefined();
        expect(await controller.updateBoundarySocket(added!.id, { label: "direction", valueType: "Vector" })).toBe(true);
        expect(added?.label).toBe("direction");
        expect(added?.valueType).toBe("Vector");
        const inputNode = fixture.editor.getNodes().find((node) => node instanceof GroupInputNode) as GroupInputNode;
        expect(Object.keys(inputNode.outputs)).toContain(added!.id);
        expect(await controller.removeBoundarySocket(added!.id)).toBe(true);
        expect(fixture.definition.inputs.some((socket) => socket.id === added!.id)).toBe(false);
        expect(await controller.exit()).toBe(true);
    });
});

