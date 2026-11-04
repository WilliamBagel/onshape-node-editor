/**
 * Regression tests for the four codegen bugs #41, #42, #43, #48.
 *
 * Each test drives the real `generateFeatureStudioSource` path (headless
 * editor + dataflow engine, as in array-nodes.test.ts) unless noted.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ClassicPreset, NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import { Connection, Schemes } from "../types";
import { StyleSettings } from "../stylesettings";
import { DefineFeatureNode } from "../nodes/definefeaturenode";
import { OutputFeatureNode } from "../nodes/outputfeaturenode";
import { MathExpressionNode } from "../nodes/mathexpressionnode";
import { BoundedForNode } from "../nodes/arraynodes";
import { OnshapeNode } from "../nodes/onshapenode";
import { generateFeatureStudioSource } from "../graph-codegen";
import { validateGraphNodes } from "../graph-validation";
import { connectGraphNodes } from "../serialization/graph-serializer";

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

async function buildEditor(nodes: OnshapeNode[], connections: Array<[OnshapeNode, string, OnshapeNode, string]>) {
    const editor = new NodeEditor<Schemes>();
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);
    for (const node of nodes) await editor.addNode(node);
    for (const [source, sourceOutput, target, targetInput] of connections) {
        await addConnection(editor, source, sourceOutput, target, targetInput);
    }
    return { editor, engine };
}

describe("codegen regressions (#41, #42, #43, #48)", () => {
    beforeAll(() => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("#41: a wired math input substitutes the producer's binding (let v1 = v0 * 2)", async () => {
        const definition = defineNode();
        const producer = new MathExpressionNode("40");
        const math = new MathExpressionNode("x * 2");
        const loop = new BoundedForNode(3, "");
        const end = new OutputFeatureNode();
        const { editor, engine } = await buildEditor(
            [definition, producer, math, loop, end],
            [
                [definition, "context", loop, "context"],
                [loop, "context", end, "context"],
                [producer, "return", math, "x"],
                [math, "return", loop, "count"],
            ],
        );
        const source = (await generateFeatureStudioSource(editor, engine)) as string;
        expect(source).toContain("let v0 = 40;");
        expect(source).toContain("let v1 = v0 * 2;");
        expect(source).not.toContain("x * 2");
    });

    it("#48: an empty math node with a wired consumer fails validation and emits no return reference", async () => {
        const empty = new MathExpressionNode("");
        // Unit level: validation names the node (registration never happens
        // because validation runs before it in graph-codegen).
        expect(empty.validateGraph({ producers: {}, getNode: () => undefined })).toMatch(/empty/);
        expect(empty.validateGraph({ producers: {}, getNode: () => undefined })).toContain(empty.id);

        const definition = defineNode();
        const consumer = new MathExpressionNode("x * 2");
        const loop = new BoundedForNode(3, "");
        const end = new OutputFeatureNode();
        // Give the empty node a consumer at graph level: an empty node wired
        // into a math node that itself is consumed by the loop.
        const { editor, engine } = await buildEditor(
            [definition, empty, consumer, loop, end],
            [
                [definition, "context", loop, "context"],
                [loop, "context", end, "context"],
                [empty, "return", consumer, "x"],
                [consumer, "return", loop, "count"],
            ],
        );
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(/empty/);
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(new RegExp(empty.id));
    });

    it("#43: a muted standalone statement emits nothing and its context flows through", async () => {
        const definition = defineNode();
        const loop = new BoundedForNode(3, "use({index});");
        loop.muted = true;
        const end = new OutputFeatureNode();
        const { editor, engine } = await buildEditor(
            [definition, loop, end],
            [
                [definition, "context", loop, "context"],
                [loop, "context", end, "context"],
            ],
        );
        const source = (await generateFeatureStudioSource(editor, engine)) as string;
        expect(source).not.toContain("for (var index");
        expect(source).toContain("defineFeature");
    });

    it("#43: a consumer wired to a muted producer fails validation naming both nodes", async () => {
        const definition = defineNode();
        const producer = new MathExpressionNode("40");
        producer.muted = true;
        const math = new MathExpressionNode("x * 2");
        const loop = new BoundedForNode(3, "");
        const end = new OutputFeatureNode();
        const { editor, engine } = await buildEditor(
            [definition, producer, math, loop, end],
            [
                [definition, "context", loop, "context"],
                [loop, "context", end, "context"],
                [producer, "return", math, "x"],
                [math, "return", loop, "count"],
            ],
        );
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(/muted/);
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(new RegExp(math.id));
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(new RegExp(producer.id));

        // Unit level: validateGraphNodes names both nodes for a muted value producer.
        expect(() =>
            validateGraphNodes(
                [{ node: math, producers: { x: { nodeId: producer.id, outputKey: "return" } } }],
                (id) => (id === producer.id ? (producer as never) : id === math.id ? (math as never) : undefined),
            ),
        ).toThrowError(/muted/);
    });

    it("#42: the x / x0 / x chain yields three distinct identifiers and the last consumer reads the third", async () => {
        class SymbolNode extends OnshapeNode {
            constructor(title: string, public readonly symbol: string) {
                super("symbol-node", title);
                this.addInput("context", new ClassicPreset.Input(new ClassicPreset.Socket("Context"), "Context"));
                this.addInput("in", new ClassicPreset.Input(new ClassicPreset.Socket("any")));
                this.addOutput("context", new ClassicPreset.Output(new ClassicPreset.Socket("Context"), "Context"));
                this.addOutput(symbol, new ClassicPreset.Output(new ClassicPreset.Socket("any")));
            }
            public override getVariableSymbols(): string[] {
                return [this.symbol];
            }
            public override getFeatureScriptInfo(variableMapping: Record<string, string>) {
                return { line: `// ${this.symbol} <= ${variableMapping["in"] ?? "none"};` };
            }
        }

        const definition = defineNode();
        const n1 = new SymbolNode("N1", "x");
        const n2 = new SymbolNode("N2", "x0");
        const n3 = new SymbolNode("N3", "x");
        const n4 = new SymbolNode("N4", "x");
        const end = new OutputFeatureNode();
        const { editor, engine } = await buildEditor(
            [definition, n1, n2, n3, n4, end],
            [
                [definition, "context", n1, "context"],
                [n1, "context", n2, "context"],
                [n1, "x", n2, "in"],
                [n2, "context", n3, "context"],
                [n2, "x0", n3, "in"],
                [n3, "context", n4, "context"],
                [n3, "x", n4, "in"],
                [n4, "context", end, "context"],
            ],
        );
        const source = (await generateFeatureStudioSource(editor, engine)) as string;
        const reads = [...source.matchAll(/\/\/ (\S+) <= (\S+);/g)].map((m) => [m[1], m[2]]);
        // N2 reads N1's `x`, N3 reads N2's `x0`, N4 (the last consumer) reads
        // N3's identifier, which must be distinct from both `x` and `x0`.
        expect(reads).toContainEqual(["x0", "x"]);
        expect(reads).toContainEqual(["x", "x0"]);
        const rhsValues = reads.map(([, rhs]) => rhs).filter((rhs) => rhs !== "none");
        expect(new Set(rhsValues).size).toBe(3);
        expect(rhsValues).toContain("x");
        expect(rhsValues).toContain("x0");
        // The last consumer (n4) reads the third node's variable.
        expect(source).toContain("// x <= x1;");
    });
});
