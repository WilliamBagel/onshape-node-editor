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
    commonGroupParent,
    createGroupDefinition,
    listGroupSocketCandidates,
    extractBoundarySockets,
    addGroupSocket,
    updateGroupSocket,
    removeGroupSocket,
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

    it("a two-node subgraph, placed twice, compiles to one function and two calls", async () => {
        const fixture = await buildFixture();
        const source = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        expect(source).toBeDefined();
        // One reusable function; cross and transform each appear once, inside it.
        expect(source?.match(/function groupCrossToTransform\(/g)).toHaveLength(1);
        expect(source?.match(/cross\(/g)).toHaveLength(1);
        expect(source?.match(/transform\(/g)).toHaveLength(1);
        // One call per placement.
        expect(source?.match(/groupCrossToTransform\(/g)).toHaveLength(3);
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
        // First entry computes and persists the permanent Start/End positions
        // (null -> placed), so the definition legitimately gains them; every
        // later round-trip must leave the outer document byte-identical.
        let outerBaseline: ReturnType<typeof serializeGraph> | null = null;
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
            if (outerBaseline == null) {
                const afterFirst = serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id));
                expect(afterFirst.connections).toEqual(outerBefore.connections);
                expect(afterFirst.nodes.map((node) => node.id).sort()).toEqual(outerBefore.nodes.map((node) => node.id).sort());
                for (const def of afterFirst.groupDefinitions ?? []) {
                    expect(def.boundaryNodes?.inputId).toBeTruthy();
                    expect(def.boundaryNodes?.outputId).toBeTruthy();
                    expect(def.boundaryNodes?.inputPosition).not.toBeNull();
                    expect(def.boundaryNodes?.outputPosition).not.toBeNull();
                }
                outerBaseline = afterFirst;
            }
        }
        const outerAfter = serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id));
        expect(outerAfter.connections).toEqual(outerBaseline!.connections);
        expect(outerAfter.nodes.map((node) => node.id).sort()).toEqual(outerBaseline!.nodes.map((node) => node.id).sort());
        expect(outerAfter.groupDefinitions).toEqual(outerBaseline!.groupDefinitions);
    });

    it("permanent boundary cards keep stable ids and moved positions across exit + re-enter", async () => {
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

        const instanceId = (): string => {
            const id = fixture.editor.getNodes().find((node) => node instanceof GroupNode)?.id;
            expect(id).toBeTruthy();
            return id as string;
        };

        expect(await controller.toggle(instanceId())).toBe("entered");
        const firstInput = fixture.editor.getNodes().find((node) => node instanceof GroupInputNode);
        const firstOutput = fixture.editor.getNodes().find((node) => node instanceof GroupOutputNode);
        expect(firstInput).toBeDefined();
        expect(firstOutput).toBeDefined();
        const inputId = firstInput!.id;
        const outputId = firstOutput!.id;
        // The cards are the definition's permanent cards, even when empty.
        expect(controller.isBoundaryNode(inputId)).toBe(true);
        expect(controller.isBoundaryNode(outputId)).toBe(true);
        expect(controller.isBoundaryNode(fixture.cross.id)).toBe(false);
        // User moves the cards, then exits.
        positions[inputId] = { x: -500, y: 333 };
        positions[outputId] = { x: 1234, y: -99 };
        expect(await controller.toggle()).toBe("exited");

        expect(await controller.toggle(instanceId())).toBe("entered");
        const secondInput = fixture.editor.getNodes().find((node) => node instanceof GroupInputNode);
        const secondOutput = fixture.editor.getNodes().find((node) => node instanceof GroupOutputNode);
        expect(secondInput?.id).toBe(inputId);
        expect(secondOutput?.id).toBe(outputId);
        expect(positions[inputId]).toEqual({ x: -500, y: 333 });
        expect(positions[outputId]).toEqual({ x: 1234, y: -99 });
        // Definitions agree, and cards never became top-level nodes.
        expect(fixture.definition.boundaryNodes.inputId).toBe(inputId);
        expect(fixture.definition.boundaryNodes.outputId).toBe(outputId);
        expect(fixture.definition.boundaryNodes.inputPosition).toEqual({ x: -500, y: 333 });
        expect(fixture.definition.boundaryNodes.outputPosition).toEqual({ x: 1234, y: -99 });
        const docInside = serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id));
        expect(docInside.nodes.map((node) => node.id)).not.toContain(inputId);
        expect(docInside.nodes.map((node) => node.id)).not.toContain(outputId);
        expect(await controller.toggle()).toBe("exited");
        const doc = serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id));
        expect(doc.nodes.map((node) => node.id)).not.toContain(inputId);
        expect(doc.nodes.map((node) => node.id)).not.toContain(outputId);
        expect(doc.groupDefinitions?.[0]?.boundaryNodes).toEqual({
            inputId,
            outputId,
            inputPosition: { x: -500, y: 333 },
            outputPosition: { x: 1234, y: -99 },
        });

        // Serialization round-trip preserves the permanent boundary record.
        const saved = serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id));
        const loaded = deserializeGraph(JSON.parse(JSON.stringify(saved)), { resolveSpec: () => undefined });
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const reloaded = loaded.graph.groupDefinitions.find((d) => d.id === fixture.definition.id);
        expect(reloaded?.boundaryNodes).toEqual({
            inputId,
            outputId,
            inputPosition: { x: -500, y: 333 },
            outputPosition: { x: 1234, y: -99 },
        });
        // Entering the reloaded definition reuses the same ids/positions.
        const reloadedInstance = loaded.graph.nodes.find((node) => node instanceof GroupNode) as GroupNode | undefined;
        expect(reloadedInstance).toBeDefined();
        expect(reloadedInstance!.getDefinition().boundaryNodes.inputId).toBe(inputId);
    });

    it("a muted instance is skipped by codegen", async () => {
        const fixture = await buildFixture();
        fixture.instance2.muted = true;
        const source = await generateFeatureStudioSource(fixture.editor, fixture.engine);
        // The definition still compiles (instance1 places it), once.
        expect(source?.match(/cross\(/g)).toHaveLength(1);
        expect(source?.match(/transform\(/g)).toHaveLength(1);
        // Exactly one call: the non-muted instance's. The muted instance
        // emits none, and its consumer falls back to its own literal.
        expect(source?.match(/groupCrossToTransform\(/g)).toHaveLength(2);
        expect(source).toContain("opTransform");
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

    it("groups nest: the outer function calls the inner function per placement", async () => {
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
        // One function per definition: the inner cross appears once; the
        // outer function body contains two inner calls (both placements).
        expect(source?.match(/cross\(/g)).toHaveLength(1);
        expect(source?.match(/groupCrossToTransform\(/g)).toHaveLength(3);
        expect(source?.match(/groupOuter\(/g)).toHaveLength(2);
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

    it("commonGroupParent returns the shared frame only when all members share it", () => {
        expect(commonGroupParent([{ group: "f1" }, { group: "f1" }])).toBe("f1");
        expect(commonGroupParent([{ group: "f1" }, { group: null }])).toBeNull();
        expect(commonGroupParent([{ group: "f1" }, { group: "f2" }])).toBeNull();
        expect(commonGroupParent([{ group: null }, { group: null }])).toBeNull();
        expect(commonGroupParent([])).toBeNull();
    });

    it("groupmodel boundary APIs: add, rename/retype, remove and candidates", () => {
        const fixtureNode = utility("cross");
        const definition = createGroupDefinition("g-test", "Test");
        definition.nodes = [fixtureNode];
        const candidates = listGroupSocketCandidates(definition);
        expect(candidates.inputs.length + candidates.outputs.length).toBeGreaterThan(0);
        const added = addGroupSocket(definition, "input", fixtureNode.id, "vector1");
        expect(added).not.toBeNull();
        expect(addGroupSocket(definition, "input", fixtureNode.id, "vector1")).toBeNull();
        expect(addGroupSocket(definition, "input", fixtureNode.id, "missing")).toBeNull();
        expect(updateGroupSocket(definition, added!.id, { label: "inVec", valueType: "Vector" })).toBe(true);
        expect(added?.label).toBe("inVec");
        expect(removeGroupSocket(definition, added!.id)).toBe(true);
        expect(removeGroupSocket(definition, added!.id)).toBe(false);
    });

    it("snapshots omit transient boundary cards", async () => {
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
        const docInside = serializeGraph(fixture.editor, positions, fixture.editor.getNodes().map((node) => node.id)) as { nodes: { kind: string }[]; connections: unknown[] };
        const kinds = docInside.nodes.map((node) => node.kind);
        expect(kinds).not.toContain("group-input");
        expect(kinds).not.toContain("group-output");
        // Boundary wiring connections must also be omitted (transient endpoints).
        const nodesInside = fixture.editor.getNodes();
        const boundaryIds = new Set(nodesInside.filter((n) => n.transient).map((n) => n.id));
        for (const connection of docInside.connections as { source: string; target: string }[]) {
            expect(boundaryIds.has(connection.source)).toBe(false);
            expect(boundaryIds.has(connection.target)).toBe(false);
        }
        expect(await controller.exit()).toBe(true);
    });

    it("nested group enter/exit keeps the outer boundary cards", async () => {
        // Isolated editor (no leftover define/output chains) so the nested
        // snapshot round-trip exercises only the controller.
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);
        const positions: Record<string, { x: number; y: number } | null> = {};
        const cross = utility("cross");
        const transform = utility("transform");
        const innerDef = createGroupDefinition("group-inner", "Inner");
        innerDef.nodes = [cross, transform];
        innerDef.connections = [{ source: cross.id, sourceOutput: "return", target: transform.id, targetInput: "translation" }];
        innerDef.inputs = [{ id: `${cross.id}.vector1`, label: "vector1", direction: "input", nodeId: cross.id, socketKey: "vector1" }];
        innerDef.outputs = [{ id: `${transform.id}.return`, label: "return", direction: "output", nodeId: transform.id, socketKey: "return" }];
        const innerInstance = new GroupNode(innerDef);
        const outerDef = createGroupDefinition("group-outer2", "Outer");
        outerDef.nodes = [innerInstance];
        outerDef.connections = [];
        outerDef.inputs = [];
        outerDef.outputs = [];
        const outerInstance = new GroupNode(outerDef);
        await editor.addNode(outerInstance);
        editor.getNodes().forEach((node, index) => {
            positions[node.id] = { x: index * 10, y: index * 20 };
        });
        const controller = new GroupEditorController(editor, {
            snapshot: () => ({ document: JSON.stringify(serializeGraph(editor, positions, editor.getNodes().map((node) => node.id))), positions: { ...positions } }),
            restore: async (snap) => {
                const loaded = deserializeGraph(JSON.parse(snap.document), { resolveSpec: () => undefined });
                if (!loaded.ok) throw new Error(loaded.error);
                for (const connection of [...editor.getConnections()]) await editor.removeConnection(connection.id);
                for (const node of [...editor.getNodes()]) await editor.removeNode(node.id);
                await applyGraph(editor, loaded.graph);
            },
            getPositions: () => ({ ...positions }),
            setPositions: async (next) => { Object.assign(positions, next); },
        });
        expect(await controller.enter(outerInstance.id)).toBe(true);
        expect(editor.getNodes().some((n) => n instanceof GroupNode)).toBe(true);
        const outerInnerId = editor.getNodes().find((n) => n instanceof GroupNode)?.id;
        expect(outerInnerId).toBeTruthy();
        expect(await controller.enter(outerInnerId!)).toBe(true);
        expect(controller.depth).toBe(2);
        expect(editor.getNodes().some((n) => n instanceof GroupInputNode)).toBe(true);
        expect(await controller.exit()).toBe(true);
        expect(controller.depth).toBe(1);
        expect(editor.getNodes().some((n) => n instanceof GroupInputNode)).toBe(true);
        expect(editor.getNodes().some((n) => n instanceof GroupOutputNode)).toBe(true);
        expect(await controller.exit()).toBe(true);
        expect(controller.depth).toBe(0);
    });

    it("keeps same-id input and output boundary edits separate", () => {
        const definition = createGroupDefinition("d", "Same socket both ways");
        definition.inputs = [{ id: "n.context", label: "in", direction: "input", nodeId: "n", socketKey: "context" }];
        definition.outputs = [{ id: "n.context", label: "out", direction: "output", nodeId: "n", socketKey: "context" }];
        expect(updateGroupSocket(definition, "n.context", { label: "renamed-in" }, "input")).toBe(true);
        expect(definition.inputs[0].label).toBe("renamed-in");
        expect(definition.outputs[0].label).toBe("out");
        expect(removeGroupSocket(definition, "n.context", "output")).toBe(true);
        expect(definition.inputs).toHaveLength(1);
        expect(definition.outputs).toHaveLength(0);
    });
});

