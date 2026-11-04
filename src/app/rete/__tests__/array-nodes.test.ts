/**
 * Issue #12 — array and iteration nodes.
 *
 * Covers: expression codegen for literal/concat/index/size/mapArray, the
 * bounded `for` statement, socket compatibility for `array<T>`, the
 * instance-on-points style wiring (an upstream array feeding a consumer
 * with no manual edits), build-time rejection of iterating over a `Query`
 * and of unbounded loops, and serialization round-trips.
 */
import { describe, expect, it, vi, beforeAll } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";
import { Connection, Schemes } from "../types";
import { StyleSettings } from "../stylesettings";
import { DefineFeatureNode } from "../nodes/definefeaturenode";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
import { OutputFeatureNode } from "../nodes/outputfeaturenode";
import {
    ArrayConcatNode,
    ArrayIndexNode,
    ArrayLiteralNode,
    ArraySizeNode,
    BoundedForNode,
    ForEachNode,
    MapArrayNode,
    MAX_LOOP_BOUND,
    createArrayNode,
} from "../nodes/arraynodes";
import { OnshapeSocket } from "../onshapesockets";
import { checkCompatibility, type ValueType } from "../../onshape-utils/valuetypes";
import { assembleExpressionCode } from "../../onshape-utils/expressioncodegen";
import { generateFeatureStudioSource } from "../graph-codegen";
import { validateGraphNodes } from "../graph-validation";
import { createArrayNode as factoryCreate } from "../catalog-node-factory";
import { connectGraphNodes } from "../serialization/graph-serializer";
import { OnshapeNode } from "../nodes/onshapenode";

const vector: ValueType = { name: "Vector" };
const query: ValueType = { name: "Query" };
const number: ValueType = { name: "number" };

describe("array expression codegen", () => {
    it("emits an array literal from its elements", () => {
        const literal = new ArrayLiteralNode(vector, 2);
        const expr = literal.getExpressionInfo({
            variableMapping: { e0: "vA", e1: "vB" },
            inputProducers: { e0: "nA", e1: "nB" },
        });
        expect(expr.expression).toBe("[{e0}, {e1}]");
        expect(expr.inputs).toEqual({ e0: "nA", e1: "nB" });
        expect(expr.valueType).toEqual({ name: "array", element: vector });
        const lines = assembleExpressionCode(
            [
                { nodeId: "nA", producer: "Vector", expression: "vector(1 mm, 2 mm, 3 mm)", valueType: vector },
                { nodeId: "nB", producer: "Vector", expression: "vector(4 mm, 5 mm, 6 mm)", valueType: vector },
                expr,
            ],
            [],
        ).map((entry) => entry.line);
        expect(lines).toContain("let v0 = vector(1 mm, 2 mm, 3 mm);");
        expect(lines).toContain("let v2 = [v0, v1];");
    });

    it("emits concatenateArrays for the concat node", () => {
        const concat = new ArrayConcatNode(vector);
        const expr = concat.getExpressionInfo({
            variableMapping: { a: "v0", b: "v1" },
            inputProducers: { a: "n0", b: "n1" },
        });
        expect(expr.expression).toBe("concatenateArrays({a}, {b})");
        expect(expr.valueType).toEqual({ name: "array", element: vector });
    });

    it("emits an index expression from array + index", () => {
        const index = new ArrayIndexNode(vector);
        const expr = index.getExpressionInfo({
            variableMapping: { array: "v0", index: "v1" },
            inputProducers: { array: "n0", index: "n1" },
        });
        expect(expr.expression).toBe("({array})[{index}]");
        expect(expr.valueType).toEqual(vector);
    });

    it("emits size(...) for the size node", () => {
        const size = new ArraySizeNode();
        const expr = size.getExpressionInfo({
            variableMapping: { array: "v0" },
            inputProducers: { array: "n0" },
        });
        expect(expr.expression).toBe("size({array})");
        expect(expr.valueType).toEqual(number);
    });

    it("emits a mapArray expression with the item substitution", () => {
        const mapNode = new MapArrayNode(vector, vector, "{item} * 2");
        const expr = mapNode.getExpressionInfo({
            variableMapping: { array: "v0" },
            inputProducers: { array: "n0" },
        });
        expect(expr.expression).toBe("mapArray({array}, function(item) { return item * 2; })");
        expect(expr.valueType).toEqual({ name: "array", element: vector });
    });

    it("factory creates every variant, mirroring the catalog factory", () => {
        expect(createArrayNode("array-literal")).toBeInstanceOf(ArrayLiteralNode);
        expect(createArrayNode("array-concat")).toBeInstanceOf(ArrayConcatNode);
        expect(createArrayNode("array-index")).toBeInstanceOf(ArrayIndexNode);
        expect(createArrayNode("array-size")).toBeInstanceOf(ArraySizeNode);
        expect(createArrayNode("map-array")).toBeInstanceOf(MapArrayNode);
        expect(createArrayNode("for-each")).toBeInstanceOf(ForEachNode);
        expect(createArrayNode("bounded-for")).toBeInstanceOf(BoundedForNode);
        expect(factoryCreate("array-size")).toBeInstanceOf(ArraySizeNode);
    });
});

describe("statement codegen for iteration", () => {
    it("forEach emits a bounded for over size(array) with an index variable", () => {
        const node = new ForEachNode("consume({item}, {index});");
        const info = node.getFeatureScriptInfo({ array: "v0" });
        expect(info.line).toContain("for (var index = 0; index < size(v0); index += 1) {");
        expect(info.line).toContain("consume((v0)[index], index);");
    });

    it("bounded-for emits a for statement with an index variable and the bound", () => {
        const node = new BoundedForNode(3, "use({index});");
        const info = node.getFeatureScriptInfo({ count: "3" });
        expect(info.line).toContain("for (var index = 0; index < 3; index += 1) {");
        expect(info.line).toContain("use(index);");

        // Wired count wins over the literal bound.
        const wired = new BoundedForNode(100);
        expect(wired.getFeatureScriptInfo({ count: "vCount" }).line).toContain("index < vCount");
    });
});

describe("array<T> socket compatibility", () => {
    const socket = (t: ValueType) => new OnshapeSocket("x", t);
    it("array<Vector> feeds array<Vector> and an array instance consumer with no edits", () => {
        const arrayVector: ValueType = { name: "array", element: vector };
        const arrayQuery: ValueType = { name: "array", element: query };
        expect(socket(arrayVector).isCompatibleWith(socket(arrayVector))).toBe(true);
        expect(checkCompatibility(arrayVector, arrayQuery).compatible).toBe(false);
        expect(checkCompatibility(arrayVector, vector).compatible).toBe(false);
        expect(checkCompatibility(vector, arrayVector).compatible).toBe(false);
        expect(checkCompatibility(arrayQuery, arrayQuery).compatible).toBe(true);
    });
});

/* Integration helpers: a real editor, as in graph-codegen.test.ts. */

const INSTANCE_SPEC = {
    btType: "BTFeatureSpec-129",
    featureType: "instanceOnPoints",
    featureTypeName: "Instance On Points",
    parameters: [
        {
            btType: "BTParameterSpecArray-2600",
            parameterId: "points",
            parameterName: "Points to instance on",
            defaultValue: { btType: "BTParameterArray-2610", elements: [] },
            parameters: [
                {
                    btType: "BTParameterSpecQuery-174",
                    parameterId: "point",
                    parameterName: "Point",
                    defaultValue: { btType: "BTMParameterQueryList-148", nodeId: "", queries: [] },
                },
            ],
        },
    ],
} as unknown as BTFeatureSpec129;

async function addConnection(
    editor: NodeEditor<Schemes>,
    source: OnshapeNode,
    sourceOutput: string,
    target: OnshapeNode,
    targetInput: string,
): Promise<void> {
    const connection = new Connection(
        source as never,
        sourceOutput,
        source.outputs[sourceOutput].socket.name,
        target as never,
        targetInput,
        target.inputs[targetInput].socket.name,
        new StyleSettings(),
    );
    await editor.addConnection(connection);
    connectGraphNodes(editor, connection);
}

function defineNode() {
    return new DefineFeatureNode({
        annotation: { type: "Feature Type Name", value: "My Feature" },
        preconditions: [{ annotation: { type: "Property Function Name", value: "entities" }, btType: "BTParameterSpecQuery-174" }],
    } as never);
}

describe("graph integration", () => {
    beforeAll(() => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("an upstream array feeds an instance consumer with no manual edits", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);

        const definition = defineNode();
        const instance = new CustomFeatureNode(INSTANCE_SPEC);
        const end = new OutputFeatureNode();
        // Upstream: two queries collected into an array literal — the
        // instance-on-points style array. No manual variable mapping edits.
        const literal = new ArrayLiteralNode(query, 2);

        await editor.addNode(definition);
        await editor.addNode(literal);
        await editor.addNode(instance);
        await editor.addNode(end);
        await addConnection(editor, definition, "context", instance, "context");
        await addConnection(editor, instance, "context", end, "context");
        await addConnection(editor, literal, "return", instance, "points");

        // The literal's output socket is compatible with the instance
        // node's array<Query> parameter socket — no manual edits needed.
        const literalSocket = literal.outputs["return"].socket as unknown as OnshapeSocket;
        const paramSocket = instance.inputs["points"].socket as unknown as OnshapeSocket;
        expect(literalSocket.isCompatibleWith(paramSocket)).toBe(true);

        const source = await generateFeatureStudioSource(editor, engine);
        expect(source).toBeDefined();
        // The array was hoisted and passed to the feature by name.
        expect(source as string).toContain("let v0 = [null, null];");
        expect(source as string).toContain("v0");
    });

    it("iteration over a Query is rejected at build time, naming the node", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);

        const definition = defineNode();
        const forEach = new ForEachNode("");
        const queryAt = new ArrayIndexNode(query);
        const end = new OutputFeatureNode();

        await editor.addNode(definition);
        await editor.addNode(queryAt);
        await editor.addNode(forEach);
        await editor.addNode(end);
        await addConnection(editor, definition, "context", forEach, "context");
        await addConnection(editor, forEach, "context", end, "context");
        await addConnection(editor, queryAt, "return", forEach, "array");

        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(/for-each/);
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(/Query/);
    });

    it("an unbounded bounded-for is rejected at build time, naming the node", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);

        const definition = defineNode();
        const loop = new BoundedForNode(); // no count wired, no literal bound
        const end = new OutputFeatureNode();

        await editor.addNode(definition);
        await editor.addNode(loop);
        await editor.addNode(end);
        await addConnection(editor, definition, "context", loop, "context");
        await addConnection(editor, loop, "context", end, "context");

        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(/bounded-for/);
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(/unbounded/);
    });

    it("a bounded for generates its for statement through the real path", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);

        const definition = defineNode();
        const loop = new BoundedForNode(3);
        const end = new OutputFeatureNode();

        await editor.addNode(definition);
        await editor.addNode(loop);
        await editor.addNode(end);
        await addConnection(editor, definition, "context", loop, "context");
        await addConnection(editor, loop, "context", end, "context");

        const source = await generateFeatureStudioSource(editor, engine);
        expect(source as string).toContain("for (var index = 0; index < 3; index += 1) {");
    });
});

describe("guard rails (unit)", () => {
    it("validateGraphNodes refuses a Query feeding mapArray, naming the node", () => {
        const mapNode = new MapArrayNode(vector, vector);
        const querySource = new ArrayIndexNode(query);
        expect(() =>
            validateGraphNodes(
                [{ node: mapNode, producers: { array: { nodeId: querySource.id, outputKey: "return" } } }],
                (id) => (id === querySource.id ? (querySource as never) : undefined),
            ),
        ).toThrowError(/map-array[\s\S]*Query/);
    });

    it("over-cap and negative literal bounds are refused; sane bounds pass", () => {
        for (const bad of [MAX_LOOP_BOUND + 1, -1, 2.5]) {
            const loop = new BoundedForNode(bad);
            expect(loop.validateGraph({ producers: {}, getNode: () => undefined })).toMatch(/bound/);
        }
        const ok = new BoundedForNode(MAX_LOOP_BOUND);
        expect(ok.validateGraph({ producers: {}, getNode: () => undefined })).toBeNull();
        const wired = new BoundedForNode();
        expect(
            wired.validateGraph({ producers: { count: { nodeId: "n", outputKey: "return" } }, getNode: () => undefined }),
        ).toBeNull();
    });
});

describe("serialization round-trip", () => {
    it("each array node survives toJSON → fromJSON", () => {
        const cases: Array<[object, (data: never) => object]> = [
            [new ArrayLiteralNode(query, 3), ArrayLiteralNode.fromJSON],
            [new ArrayConcatNode(vector), ArrayConcatNode.fromJSON],
            [new ArrayIndexNode(vector), ArrayIndexNode.fromJSON],
            [new ArraySizeNode(), ArraySizeNode.fromJSON],
            [new MapArrayNode(vector, query, "item + 1"), MapArrayNode.fromJSON],
            [new ForEachNode("consume({item});"), ForEachNode.fromJSON],
            [new BoundedForNode(7, "use({index});", "i"), BoundedForNode.fromJSON],
        ];
        for (const [node, fromJSON] of cases) {
            const data = (node as { toJSON(): { kind: string } }).toJSON();
            const clone = fromJSON(data as never) as typeof node & { toJSON(): { kind: string } };
            expect(clone.toJSON().kind).toBe(data.kind);
            // Ids survive, so connections can be re-linked after a load.
            expect(clone.id).toBe((node as { id: string }).id);
        }
        const literal = ArrayLiteralNode.fromJSON(new ArrayLiteralNode(vector, 3).toJSON() as never);
        expect(Object.keys(literal.inputs)).toEqual(["e0", "e1", "e2"]);
        const loop = BoundedForNode.fromJSON(new BoundedForNode(5).toJSON() as never);
        expect(loop.bound).toBe(5);
    });
});
