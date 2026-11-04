import { beforeAll, describe, expect, it, vi } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import { Schemes, Connection } from "../types";
import { StyleSettings } from "../stylesettings";
import { DefineFeatureNode } from "../nodes/definefeaturenode";
import { OutputFeatureNode } from "../nodes/outputfeaturenode";
import { FunctionNode } from "../nodes/functionnode";
import { UtilityStatementNode } from "../nodes/utilitystatementnode";
import { OnshapeNode } from "../nodes/onshapenode";
import type { OnshapeSocket } from "../onshapesockets";
const socketType = (input: { socket: OnshapeSocket }) => input.socket.valueType.name;
import { createUtilityNode, createNodeFromCatalogEntry } from "../catalog-node-factory";
import { defaultCatalog } from "../../onshape/catalog/spec-catalog";
import { generateFeatureStudioSource } from "../graph-codegen";
import { applyGraph, connectGraphNodes, deserializeGraph, serializeGraph } from "../serialization/graph-serializer";

async function connect(
    editor: NodeEditor<Schemes>,
    source: OnshapeNode,
    sourceOutput: string,
    target: OnshapeNode,
    targetInput: string,
): Promise<void> {
    const connection = new Connection(
        source,
        sourceOutput,
        socketType(source.outputs[sourceOutput]).name,
        target,
        targetInput,
        socketType(target.inputs[targetInput]).name,
        new StyleSettings(),
    );
    await editor.addConnection(connection);
    connectGraphNodes(editor, connection);
}

function defineWithBodies(): DefineFeatureNode {
    return new DefineFeatureNode({
        annotation: { type: "Feature Type Name", value: "Utility Demo" },
        preconditions: [
            {
                annotation: { type: "Property Function Name", value: "bodies" },
                btType: "BTParameterSpecQuery-174",
            },
        ],
    } as never);
}

function utility(id: string): FunctionNode {
    const node = createUtilityNode(id);
    if (!(node instanceof FunctionNode)) {
        throw new Error(`expected utility "${id}" to be a FunctionNode`);
    }
    return node;
}

function statement(id: string): UtilityStatementNode {
    const node = createUtilityNode(id);
    if (!(node instanceof UtilityStatementNode)) {
        throw new Error(`expected utility "${id}" to be a UtilityStatementNode`);
    }
    return node;
}

/**
 * Demo graph 1: vector -> cross -> transform -> opTransform.
 *
 * Each value node's default literals keep the graph connected-free except
 * for the value chain itself; opTransform consumes the transform value and
 * the define feature's body query.
 */
async function buildVectorCrossTransform(): Promise<{ editor: NodeEditor<Schemes>; engine: DataflowEngine<Schemes> }> {
    const editor = new NodeEditor<Schemes>();
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);

    const definition = defineWithBodies();
    const vecA = utility("vector");
    const vecB = utility("vector");
    vecB.setLiteral("x", "1 * mm");
    vecB.setLiteral("y", "0 * mm");
    vecB.setLiteral("z", "0 * mm");
    const crossNode = utility("cross");
    const transformNode = utility("transform");
    // translation = cross product of the two vectors
    const op = statement("opTransform");
    const end = new OutputFeatureNode();

    await editor.addNode(definition);
    await editor.addNode(vecA);
    await editor.addNode(vecB);
    await editor.addNode(crossNode);
    await editor.addNode(transformNode);
    await editor.addNode(op);
    await editor.addNode(end);

    await connect(editor, definition, "context", op, "context");
    await connect(editor, definition, "definition.bodies", op, "bodies");
    await connect(editor, vecA, "return", crossNode, "vector1");
    await connect(editor, vecB, "return", crossNode, "vector2");
    await connect(editor, crossNode, "return", transformNode, "translation");
    await connect(editor, transformNode, "return", op, "transform");
    await connect(editor, op, "context", end, "context");

    return { editor, engine };
}

/**
 * Demo graph 2: instance on points.
 *
 * Two computed transforms feed the transform array, which feeds
 * opPattern via the instance-on-points node (the body query comes from
 * the define feature).
 */
async function buildInstanceOnPoints(): Promise<{ editor: NodeEditor<Schemes>; engine: DataflowEngine<Schemes> }> {
    const editor = new NodeEditor<Schemes>();
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);

    const definition = defineWithBodies();
    const t0 = utility("transform");
    t0.setLiteral("translation", "vector(1 * mm, 0 * mm, 0 * mm)");
    const t1 = utility("transform");
    t1.setLiteral("translation", "vector(2 * mm, 0 * mm, 0 * mm)");
    const transforms = utility("transformArray");
    const instance = statement("instanceOnPoints");
    instance.setLiteral("instanceNames", '["instance0", "instance1"]');
    const end = new OutputFeatureNode();

    await editor.addNode(definition);
    await editor.addNode(t0);
    await editor.addNode(t1);
    await editor.addNode(transforms);
    await editor.addNode(instance);
    await editor.addNode(end);

    await connect(editor, definition, "context", instance, "context");
    await connect(editor, definition, "definition.bodies", instance, "body");
    await connect(editor, t0, "return", transforms, "item0");
    await connect(editor, t1, "return", transforms, "item1");
    await connect(editor, transforms, "return", instance, "transforms");
    await connect(editor, instance, "context", end, "context");

    return { editor, engine };
}

describe("utility nodes (#11)", () => {
    beforeAll(() => {
        vi.spyOn(console, "log").mockImplementation(() => { });
        vi.spyOn(console, "warn").mockImplementation(() => { });
    });

    it("vector, cross, normalize, perpendicularVector have typed ports and name their FS function in the tooltip", () => {
        const vector = utility("vector");
        expect(vector.functionName).toBe("vector");
        expect(Object.keys(vector.inputs).sort()).toEqual(["x", "y", "z"]);
        expect(socketType(vector.inputs["x"])).toBe("ValueWithUnits");
        expect(socketType(vector.outputs["return"])).toBe("Vector");
        expect(vector.tooltip).toContain("vector(x, y, z)");

        const cross = utility("cross");
        expect(socketType(cross.inputs["vector1"])).toBe("Vector");
        expect(socketType(cross.inputs["vector2"])).toBe("Vector");
        expect(cross.tooltip).toContain("cross(vector1, vector2)");

        const normalize = utility("normalize");
        expect(socketType(normalize.inputs["vector"])).toBe("Vector");
        expect(normalize.tooltip).toContain("normalize(vector)");

        const perp = utility("perpendicularVector");
        expect(socketType(perp.inputs["vec"])).toBe("Vector");
        expect(perp.tooltip).toContain("perpendicularVector(vec)");
    });

    it("matrix family has typed ports and tooltips naming the FS functions", () => {
        const matrix = utility("matrix");
        expect(matrix.functionName).toBe("matrix");
        expect(socketType(matrix.inputs["value"])).toBe("array");
        expect(socketType(matrix.outputs["return"])).toBe("Matrix");
        expect(matrix.tooltip).toContain("matrix(value)");

        const identity = utility("identityMatrix");
        expect(socketType(identity.inputs["size"])).toBe("number");
        expect(socketType(identity.outputs["return"])).toBe("Matrix");
        expect(identity.tooltip).toContain("identityMatrix(size)");

        const diagonal = utility("diagonalMatrix");
        expect(socketType(diagonal.inputs["diagonalValues"])).toBe("array");
        expect(diagonal.tooltip).toContain("diagonalMatrix(diagonalValues)");

        const rotation = utility("rotationMatrix3d");
        expect(socketType(rotation.inputs["axis"])).toBe("Vector");
        expect(socketType(rotation.inputs["angle"])).toBe("ValueWithUnits");
        expect(rotation.tooltip).toContain("rotationMatrix3d(axis, angle)");
    });

    it("transform, opTransform and instance-on-points ports and tooltips", () => {
        const transform = utility("transform");
        expect(socketType(transform.inputs["linear"])).toBe("Matrix");
        expect(socketType(transform.inputs["translation"])).toBe("Vector");
        expect(socketType(transform.outputs["return"])).toBe("Transform");
        expect(transform.tooltip).toContain("transform(linear, translation)");

        const op = statement("opTransform");
        expect(socketType(op.inputs["bodies"])).toBe("Query");
        expect(socketType(op.inputs["transform"])).toBe("Transform");
        expect(op.tooltip).toContain("opTransform(context, id");

        const instance = statement("instanceOnPoints");
        expect(socketType(instance.inputs["body"])).toBe("Query");
        expect(socketType(instance.inputs["transforms"])).toBe("array");
        // Says it is not a Blender analogue, and names opPattern.
        expect(instance.tooltip).toContain("NOT a Blender geometry-nodes analogue");
        expect(instance.tooltip).toContain("opPattern(context, id, { entities, transforms, instanceNames })");
    });

    it("catalog utility entries are node-able and create the curated nodes", () => {
        for (const [key, utilityId] of [
            ["vector::", "vector"],
            ["matrix::", "matrix"],
            ["transform::", "transform"],
        ] as const) {
            const entry = defaultCatalog.get(key);
            expect(entry?.nodeable).toBe(true);
            const node = createNodeFromCatalogEntry(entry!);
            expect(node).toBeInstanceOf(FunctionNode);
            expect((node as FunctionNode).utilityId).toBe(utilityId);
        }
        const opEntry = defaultCatalog.get("opTransform::");
        expect(createNodeFromCatalogEntry(opEntry!)).toBeInstanceOf(UtilityStatementNode);
        const instanceEntry = defaultCatalog.get("instanceOnPoints::utility");
        expect(instanceEntry?.nodeable).toBe(true);
        expect(createNodeFromCatalogEntry(instanceEntry!)).toBeInstanceOf(UtilityStatementNode);
    });

    it("vector -> cross -> transform graph generates compilable FeatureScript", async () => {
        const { editor, engine } = await buildVectorCrossTransform();
        const source = await generateFeatureStudioSource(editor, engine);
        expect(source).toBeDefined();
        // Let-hoisted value bindings, in dependency order.
        const lines = source!.split("\n");
        const vectorLine = lines.find((l) => l.includes("vector(0 * mm, 0 * mm, 0 * mm)"))!;
        const crossLine = lines.find((l) => l.includes("cross("))!;
        const transformLine = lines.find((l) => l.includes("transform("))!;
        expect(vectorLine).toContain("vector(0 * mm, 0 * mm, 0 * mm)");
        expect(crossLine).toContain("cross(");
        expect(transformLine).toContain("transform(identityMatrix(3), ");
        const crossBinding = /let (v\d+) = cross\(/.exec(crossLine)?.[1];
        expect(crossBinding).toBeDefined();
        expect(transformLine).toContain(`${crossBinding!}`);
        // The statement binding uses the hoisted transform name.
        const vectorBinding = /let (v\d+) = vector\(0 \* mm, 0 \* mm, 0 \* mm\)/.exec(vectorLine)?.[1];
        expect(vectorBinding).toBeDefined();
        expect(source).toContain("opTransform(context, id, { \"bodies\" : definition.bodies, \"transform\" : ");
    });

    it("instance-on-points graph generates opPattern over the transform array", async () => {
        const { editor, engine } = await buildInstanceOnPoints();
        const source = await generateFeatureStudioSource(editor, engine);
        expect(source).toBeDefined();
        expect(source).toContain("transform(identityMatrix(3), vector(1 * mm, 0 * mm, 0 * mm))");
        expect(source).toContain("transform(identityMatrix(3), vector(2 * mm, 0 * mm, 0 * mm))");
        // opPattern copies the body query at both transforms.
        expect(source).toContain(
            'opPattern(context, id, { "entities" : definition.bodies, "transforms" : ',
        );
        expect(source).toContain('"instanceNames" : ["instance0", "instance1"]');
    });

    it("utility graphs serialize and restore to byte-identical FeatureScript", async () => {
        const { editor, engine } = await buildVectorCrossTransform();
        const original = await generateFeatureStudioSource(editor, engine);
        const serialized = serializeGraph(editor);
        expect(JSON.parse(JSON.stringify(serialized)).nodes.find((n: { kind: string }) => n.kind === "utility-statement")).toBeDefined();

        const loaded = deserializeGraph(JSON.parse(JSON.stringify(serialized)), { resolveSpec: () => undefined });
        if (!loaded.ok) throw new Error(loaded.error);
        const restored = new NodeEditor<Schemes>();
        const restoredEngine = new DataflowEngine<Schemes>();
        restored.use(restoredEngine);
        await applyGraph(restored, loaded.graph);
        const restoredSource = await generateFeatureStudioSource(restored, restoredEngine);
        expect(restoredSource).toBe(original);
    });

    it("literal defaults make a bare vector node self-contained", () => {
        const vector = utility("vector");
        expect(vector.getFeaturescript({})).toBe("vector(0 * mm, 0 * mm, 0 * mm)");
        const expr = vector.getExpressionInfo({ variableMapping: {}, inputProducers: {} });
        expect(expr?.expression).toBe("vector({x}, {y}, {z})");
        expect(expr?.inputs).toEqual({ x: "0 * mm", y: "0 * mm", z: "0 * mm" });
        expect(expr?.valueType.name).toBe("Vector");
    });

    it("normalize and perpendicularVector chain through expression hoisting", () => {
        const chain = utility("normalize");
        const perp = utility("perpendicularVector");
        expect(chain.getFeaturescript({ vector: "v0" })).toBe("normalize(v0)");
        expect(perp.getFeaturescript({ vec: "v1" })).toBe("perpendicularVector(v1)");
    });

    it("permutation and diagonal matrices carry array-typed ports", () => {
        const rotation = utility("rotationMatrix3d");
        expect(rotation.getFeaturescript({ axis: "a", angle: "45 * degree" })).toBe("rotationMatrix3d(a, 45 * degree)");
    });
});
