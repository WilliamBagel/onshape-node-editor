/** #47: group clone gaps — math cloning, statement literals, refusal, defaults. */
import { describe, expect, it } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import { Schemes, Connection } from "../../types";
import { StyleSettings } from "../../stylesettings";
import { createUtilityNode } from "../../catalog-node-factory";
import { FunctionNode } from "../../nodes/functionnode";
import { MathExpressionNode } from "../../nodes/mathexpressionnode";
import { UtilityStatementNode } from "../../nodes/utilitystatementnode";
import { OnshapeNode } from "../../nodes/onshapenode";
import { GroupNode } from "../../nodes/groupinstancenode";
import { CustomFeatureNode } from "../../nodes/customfeaturenode";
import {
    assertGroupableSelection,
    createGroupDefinition,
    extractBoundarySockets,
    isGroupableKind,
    setGroupSocketDefault,
    type GroupDefinition,
} from "../groupmodel";
import { expandGroupInstances } from "../group-expand";
import { DefineFeatureNode } from "../../nodes/definefeaturenode";
import { OutputFeatureNode } from "../../nodes/outputfeaturenode";

function utility(id: string): FunctionNode {
    const node = createUtilityNode(id);
    if (!(node instanceof FunctionNode)) throw new Error(`expected FunctionNode for ${id}`);
    return node;
}

function statement(id: string): UtilityStatementNode {
    const node = createUtilityNode(id);
    if (!(node instanceof UtilityStatementNode)) throw new Error(`expected UtilityStatementNode for ${id}`);
    return node;
}

async function bareEditor(): Promise<{ editor: NodeEditor<Schemes>; engine: DataflowEngine<Schemes> }> {
    const editor = new NodeEditor<Schemes>();
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);
    return { editor, engine };
}

function valueTypeFun(node: OnshapeNode): (key: string, direction: "input" | "output") => string | undefined {
    return (key, direction) => {
        const side = direction === "input" ? node.inputs : node.outputs;
        return (side?.[key]?.socket as { valueType?: { name: string } } | undefined)?.valueType?.name;
    };
}

async function connectSockets(
    editor: NodeEditor<Schemes>,
    source: OnshapeNode,
    sourceOutput: string,
    target: OnshapeNode,
    targetInput: string,
): Promise<void> {
    const styleSettings = new StyleSettings();
    const connection = new Connection(
        source,
        sourceOutput,
        (source.outputs[sourceOutput]?.socket as { name: string }).name,
        target,
        targetInput,
        (target.inputs[targetInput]?.socket as { name: string }).name,
        styleSettings,
    );
    await editor.addConnection(connection);
}

describe("group clone gaps (#47)", () => {
    it("isGroupableKind allows math; assertGroupableSelection names an unsupported node", () => {
        expect(isGroupableKind("math-expression")).toBe(true);
        expect(isGroupableKind("CustomFeature")).toBe(false);
        expect(isGroupableKind("define-feature")).toBe(false);
        const define = new DefineFeatureNode({
            annotation: { type: "Feature Type Name", value: "Refusal Demo" },
            preconditions: [],
        } as never);
        expect(() => assertGroupableSelection([define])).toThrow(/Refusal Demo.*define-feature/);
        const math = new MathExpressionNode("1 + 2");
        expect(() => assertGroupableSelection([math])).not.toThrow();
    });

    it("math expression member expands (source/bindings survive)", async () => {
        const { editor, engine } = await bareEditor();
        const math = new MathExpressionNode("2 * PI * r");
        math.setBinding("r", { name: "number" });
        const definition = createGroupDefinition("group-math", "Math group");
        definition.nodes = [math];
        const boundary = extractBoundarySockets(
            new Set([math.id]),
            [{ source: math.id, sourceOutput: "return", target: "outside", targetInput: "v" }],
            (id, key, dir) => (id === math.id ? valueTypeFun(math)(key, dir) : undefined),
        );
        definition.outputs = boundary.outputs;
        const instance = new GroupNode(definition);
        await editor.addNode(instance);
        const expanded = await expandGroupInstances(editor);
        expect(expanded).not.toBeNull();
        const clone = expanded?.editor.getNodes().find((n) => n instanceof MathExpressionNode) as MathExpressionNode;
        expect(clone).toBeDefined();
        expect(clone.source).toBe("2 * PI * r");
        expect(clone.bindings["r"]?.name).toBe("number");
        void engine;
    });

    it("UtilityStatement clone keeps literals", async () => {
        const { editor } = await bareEditor();
        const stmt = statement("opTransform");
        stmt.setLiteral("transform", "transform(identityMatrix(3))");
        const definition = createGroupDefinition("group-stmt", "Stmt group");
        definition.nodes = [stmt];
        const instance = new GroupNode(definition);
        await editor.addNode(instance);
        const expanded = await expandGroupInstances(editor);
        const clone = expanded?.editor.getNodes().find((n) => n instanceof UtilityStatementNode) as UtilityStatementNode;
        expect(clone?.getLiteral("transform")).toBe("transform(identityMatrix(3))");
    });

    it("unsupported member kind throws at expansion naming the kind", async () => {
        const { editor } = await bareEditor();
        const output = new OutputFeatureNode();
        const definition = createGroupDefinition("group-out", "Output group");
        definition.nodes = [output as unknown as OnshapeNode];
        const instance = new GroupNode(definition);
        await editor.addNode(instance);
        await expect(expandGroupInstances(editor)).rejects.toThrow(/output-feature/);
    });

    it("defaultLiteral feeds an unconnected boundary input", async () => {
        const { editor } = await bareEditor();
        const cross = utility("cross");
        cross.setLiteral("vector2", "vector(0 * mm, 1 * mm, 0 * mm)");
        const definition = createGroupDefinition("group-default", "Default group");
        definition.nodes = [cross];
        const boundary = extractBoundarySockets(
            new Set([cross.id]),
            [{ source: "outside", sourceOutput: "return", target: cross.id, targetInput: "vector1" }],
            (id, key, dir) => valueTypeFun(cross)(key, dir),
        );
        definition.inputs = boundary.inputs;
        definition.outputs = boundary.outputs;
        setGroupSocketDefault(definition, `${cross.id}.vector1`, "vector(1 * mm, 0 * mm, 0 * mm)");
        const instance = new GroupNode(definition);
        await editor.addNode(instance);
        const expanded = await expandGroupInstances(editor);
        expect(expanded).not.toBeNull();
        const clone = expanded?.editor.getNodes().find((n) => n instanceof FunctionNode && n !== (cross as unknown as FunctionNode)) as FunctionNode | undefined;
        expect(clone?.getLiteral("vector1")).toBe("vector(1 * mm, 0 * mm, 0 * mm)");
        expect(clone?.getFeaturescript({})).toContain("vector(1 * mm, 0 * mm, 0 * mm)");
    });

    it("connected boundary input wins over defaultLiteral", async () => {
        const { editor } = await bareEditor();
        const vec = utility("vector");
        vec.setLiteral("x", "1 * mm");
        vec.setLiteral("y", "0 * mm");
        vec.setLiteral("z", "0 * mm");
        const cross = utility("cross");
        const definition = createGroupDefinition("group-connected", "Connected group");
        definition.nodes = [cross];
        const boundary = extractBoundarySockets(
            new Set([cross.id]),
            [{ source: "outside", sourceOutput: "return", target: cross.id, targetInput: "vector1" }],
            (id, key, dir) => valueTypeFun(cross)(key, dir),
        );
        definition.inputs = boundary.inputs;
        definition.outputs = boundary.outputs;
        setGroupSocketDefault(definition, `${cross.id}.vector1`, "vector(9 * mm, 9 * mm, 9 * mm)");
        const instance = new GroupNode(definition);
        await editor.addNode(vec);
        await editor.addNode(instance);
        await connectSockets(editor, vec, "return", instance as unknown as OnshapeNode, `${cross.id}.vector1`);
        const expanded = await expandGroupInstances(editor);
        const clone = expanded?.editor.getNodes().find((n) => n instanceof FunctionNode && n.functionName === "cross") as FunctionNode;
        expect(clone.getLiteral("vector1")).toBeUndefined();
    });
});

