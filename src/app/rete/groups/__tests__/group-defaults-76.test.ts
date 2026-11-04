/** #76: group boundary defaults — nested, muted-wired, math members, message. */
import { describe, expect, it, vi, beforeAll } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import { Schemes, Connection } from "../../types";
import { StyleSettings } from "../../stylesettings";
import { createUtilityNode } from "../../catalog-node-factory";
import { FunctionNode } from "../../nodes/functionnode";
import { MathExpressionNode } from "../../nodes/mathexpressionnode";
import { OnshapeNode } from "../../nodes/onshapenode";
import { GroupNode } from "../../nodes/groupinstancenode";
import { OutputFeatureNode } from "../../nodes/outputfeaturenode";
import { createGroupDefinition, type GroupDefinition, type GroupSocketDefinition } from "../groupmodel";
import { expandGroupInstances } from "../group-expand";

beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

function utility(id: string): FunctionNode {
    const node = createUtilityNode(id);
    if (!(node instanceof FunctionNode)) throw new Error(`expected FunctionNode for ${id}`);
    return node;
}

async function bareEditor() {
    const editor = new NodeEditor<Schemes>();
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);
    return { editor, engine };
}

async function connectSockets(editor: NodeEditor<Schemes>, source: OnshapeNode, sourceOutput: string, target: OnshapeNode, targetInput: string): Promise<void> {
    const connection = new Connection(
        source, sourceOutput, (source.outputs[sourceOutput]?.socket as { name: string }).name,
        target, targetInput, (target.inputs[targetInput]?.socket as { name: string }).name,
        new StyleSettings(),
    );
    await editor.addConnection(connection);
}

function inSocket(nodeId: string, key: string, defaultLiteral?: string): GroupSocketDefinition {
    return {
        id: `${nodeId}.${key}`, label: key, direction: "input", nodeId, socketKey: key,
        valueType: "Vector", ...(defaultLiteral != null ? { defaultLiteral } : {}),
    };
}
function outSocket(nodeId: string, key: string): GroupSocketDefinition {
    return { id: `${nodeId}.${key}`, label: key, direction: "output", nodeId, socketKey: key, valueType: "Vector" };
}

function crossDefinition(id: string, def: GroupDefinition, cross: FunctionNode, vector1Default?: string) {
    def.nodes = [cross];
    def.inputs = [inSocket(cross.id, "vector1", vector1Default)];
    def.outputs = [outSocket(cross.id, "return")];
    return def;
}

describe("group defaults (#76)", () => {
    it("nested group instance receives its inner defaultLiteral recursively", async () => {
        const { editor } = await bareEditor();
        const cross = utility("cross");
        const inner = crossDefinition("inner", createGroupDefinition("group-inner", "Inner"), cross, "vector(7 * mm, 0 * mm, 0 * mm)");
        const innerInstance = new GroupNode(inner);
        const outer = createGroupDefinition("group-outer", "Outer");
        outer.nodes = [innerInstance];
        outer.inputs = [{ id: `${innerInstance.id}.${cross.id}.vector1`, label: "vector1", direction: "input", nodeId: innerInstance.id, socketKey: `${cross.id}.vector1`, valueType: "Vector" }];
        outer.outputs = [{ id: `${innerInstance.id}.${cross.id}.return`, label: "return", direction: "output", nodeId: innerInstance.id, socketKey: `${cross.id}.return`, valueType: "Vector" }];
        const outerInstance = new GroupNode(outer);
        await editor.addNode(outerInstance);
        const expanded = await expandGroupInstances(editor);
        const clone = expanded?.editor.getNodes().find((n) => n instanceof FunctionNode && n.functionName === "cross") as FunctionNode;
        expect(clone.getLiteral("vector1")).toBe("vector(7 * mm, 0 * mm, 0 * mm)");
        expect(clone.getFeaturescript({})).toContain("vector(7 * mm, 0 * mm, 0 * mm)");
    });

    it("outer default wins over inner default", async () => {
        const { editor } = await bareEditor();
        const cross = utility("cross");
        const inner = crossDefinition("inner", createGroupDefinition("group-inner", "Inner"), cross, "vector(7 * mm, 0 * mm, 0 * mm)");
        const innerInstance = new GroupNode(inner);
        const outer = createGroupDefinition("group-outer", "Outer");
        outer.nodes = [innerInstance];
        outer.inputs = [{ id: `${innerInstance.id}.${cross.id}.vector1`, label: "vector1", direction: "input", nodeId: innerInstance.id, socketKey: `${cross.id}.vector1`, valueType: "Vector", defaultLiteral: "vector(8 * mm, 0 * mm, 0 * mm)" }];
        outer.outputs = [{ id: `${innerInstance.id}.${cross.id}.return`, label: "return", direction: "output", nodeId: innerInstance.id, socketKey: `${cross.id}.return`, valueType: "Vector" }];
        await editor.addNode(new GroupNode(outer));
        const expanded = await expandGroupInstances(editor);
        const clone = expanded?.editor.getNodes().find((n) => n instanceof FunctionNode && n.functionName === "cross") as FunctionNode;
        expect(clone.getLiteral("vector1")).toBe("vector(8 * mm, 0 * mm, 0 * mm)");
    });

    it("math member accepts a boundary default and uses it in its expression", async () => {
        const { editor } = await bareEditor();
        const math = new MathExpressionNode("x * 2");
        const definition = createGroupDefinition("group-math-def", "Math def");
        definition.nodes = [math];
        definition.inputs = [{ id: `${math.id}.x`, label: "x", direction: "input", nodeId: math.id, socketKey: "x", defaultLiteral: "5" }];
        definition.outputs = [{ id: `${math.id}.return`, label: "return", direction: "output", nodeId: math.id, socketKey: "return" }];
        await editor.addNode(new GroupNode(definition));
        const expanded = await expandGroupInstances(editor);
        const clone = expanded?.editor.getNodes().find((n) => n instanceof MathExpressionNode) as MathExpressionNode;
        expect(clone.getLiteral("x")).toBe("5");
        const expr = clone.getExpressionInfo({ variableMapping: {}, inputProducers: {} });
        expect(expr?.inputs?.["x"]).toBe("5");
        expect(expr?.expression).toBe("{x} * 2");
    });

    it("muted-wired boundary input falls back to defaultLiteral", async () => {
        const { editor } = await bareEditor();
        const srcCross = utility("cross");
        const srcDef = crossDefinition("src", createGroupDefinition("group-src", "Src"), srcCross);
        const srcInstance = new GroupNode(srcDef);
        srcInstance.muted = true;
        const tgtCross = utility("cross");
        const tgtDef = crossDefinition("tgt", createGroupDefinition("group-tgt", "Tgt"), tgtCross, "vector(3 * mm, 0 * mm, 0 * mm)");
        const tgtInstance = new GroupNode(tgtDef);
        await editor.addNode(srcInstance);
        await editor.addNode(tgtInstance);
        await connectSockets(editor, srcInstance as unknown as OnshapeNode, `${srcCross.id}.return`, tgtInstance as unknown as OnshapeNode, `${tgtCross.id}.vector1`);
        const expanded = await expandGroupInstances(editor);
        const clone = expanded?.editor.getNodes().find((n) => n instanceof FunctionNode && n.functionName === "cross") as FunctionNode;
        expect(clone.getLiteral("vector1")).toBe("vector(3 * mm, 0 * mm, 0 * mm)");
        expect(clone.getFeaturescript({})).toContain("vector(3 * mm, 0 * mm, 0 * mm)");
        expect(clone.getFeaturescript({})).not.toContain("vector1,");
    });

    it("muted-wired boundary input with no default fails instead of emitting an undeclared variable", async () => {
        const { editor } = await bareEditor();
        const srcCross = utility("cross");
        const srcDef = crossDefinition("src", createGroupDefinition("group-src", "Src"), srcCross);
        const srcInstance = new GroupNode(srcDef);
        srcInstance.muted = true;
        const tgtCross = utility("cross");
        const tgtDef = crossDefinition("tgt", createGroupDefinition("group-tgt", "Tgt"), tgtCross);
        const tgtInstance = new GroupNode(tgtDef);
        await editor.addNode(srcInstance);
        await editor.addNode(tgtInstance);
        await connectSockets(editor, srcInstance as unknown as OnshapeNode, `${srcCross.id}.return`, tgtInstance as unknown as OnshapeNode, `${tgtCross.id}.vector1`);
        await expect(expandGroupInstances(editor)).rejects.toThrow(/muted/);
        await expect(expandGroupInstances(editor)).rejects.toThrow(/defaultLiteral/);
        await expect(expandGroupInstances(editor)).rejects.toThrow(new RegExp(tgtInstance.id));
    });

    it("clone-refusal message lists math-expression among supported kinds", async () => {
        const { editor } = await bareEditor();
        const output = new OutputFeatureNode();
        const definition = createGroupDefinition("group-out", "Output group");
        definition.nodes = [output as unknown as OnshapeNode];
        await editor.addNode(new GroupNode(definition));
        await expect(expandGroupInstances(editor)).rejects.toThrow(/output-feature/);
        await expect(expandGroupInstances(editor)).rejects.toThrow(/math-expression/);
    });
});
