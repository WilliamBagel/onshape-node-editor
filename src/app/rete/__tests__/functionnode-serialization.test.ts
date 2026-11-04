/** #44: FunctionNode output type survives a serialization round-trip. */
import { describe, expect, it } from "vitest";
import { createNodeFromCatalogEntry, createUtilityNode } from "../catalog-node-factory";
import { FunctionNode } from "../nodes/functionnode";
import type { OnshapeSocket } from "../onshapesockets";
import type { CatalogEntry } from "../../onshape/catalog/types";
import { deserializeGraph, serializeGraph } from "../serialization/graph-serializer";
import { defaultCatalog } from "../../onshape/catalog/spec-catalog";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import type { Schemes } from "../types";

function returnTypeName(node: FunctionNode): string {
    return (node.outputs["return"].socket as OnshapeSocket).valueType.name;
}

const crossEntry: CatalogEntry = {
    key: "Math::cross", name: "cross", category: "Math", file: "f", descriptor: "d", signature: "cross(a, b)",
    description: "Cross product", kind: "value", nodeable: true,
    inputs: [
        { name: "a", valueType: "Vector", scrapedType: "Vector", description: "" },
        { name: "b", valueType: "Vector", scrapedType: "Vector", description: "" },
    ],
    outputs: [{ name: "return", valueType: "Vector", scrapedType: "Vector", description: "" }],
};

describe("FunctionNode output persistence (#44)", () => {
    it("utility node 'cross' keeps Vector through toJSON/fromJSON without resolvers", () => {
        const node = createUtilityNode("cross");
        expect(node).toBeInstanceOf(FunctionNode);
        const original = node as unknown as FunctionNode;
        expect(returnTypeName(original)).toBe("Vector");
        expect(original.toJSON().outputs?.[0]?.valueType).toBe("Vector");
        // Simulate a bare document (no resolvers) as the serializer does for utility ids.
        const restored = FunctionNode.fromJSON(original.toJSON());
        expect(returnTypeName(restored)).toBe("Vector");
    });

    it("catalog function node keeps its return type without resolvers", () => {
        const created = createNodeFromCatalogEntry(crossEntry);
        expect(created).toBeInstanceOf(FunctionNode);
        const original = created as unknown as FunctionNode;
        expect(returnTypeName(original)).toBe("Vector");
        const restored = FunctionNode.fromJSON(original.toJSON());
        expect(returnTypeName(restored)).toBe("Vector");
    });

    it("old documents without outputs still load and re-derive the utility type", () => {
        const node = createUtilityNode("cross") as unknown as FunctionNode;
        const data = { ...node.toJSON() } as Record<string, unknown>;
        delete data["outputs"];
        const restored = FunctionNode.fromJSON(data as never);
        expect(returnTypeName(restored)).toBe("Vector");
    });

    it("old documents without outputs still load via a resolved catalog entry", () => {
        const node = createNodeFromCatalogEntry(crossEntry) as unknown as FunctionNode;
        const data = { ...node.toJSON() } as Record<string, unknown>;
        delete data["outputs"];
        const restored = FunctionNode.fromJSON(data as never, (name) => (name === "cross" ? crossEntry : undefined));
        expect(returnTypeName(restored)).toBe("Vector");
    });

    it("deserializeGraph resolves an outputs-less legacy catalog node via the shipped catalog (#77)", async () => {
        const sinEntry = defaultCatalog.entries.find((e) => e.name === "sin" && e.kind === "value" && e.nodeable && e.utilityId == null);
        expect(sinEntry).toBeDefined();
        const created = createNodeFromCatalogEntry(sinEntry!) as unknown as FunctionNode;
        expect(created.utilityId).toBeUndefined();
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);
        await editor.addNode(created);
        const document = serializeGraph(editor, {}, [created.id]) as unknown as { nodes: Record<string, unknown>[] };
        delete document.nodes[0]["outputs"];
        const loaded = deserializeGraph(document, { resolveSpec: () => undefined });
        if (!loaded.ok) {
            throw new Error(loaded.error);
        }
        const restored = loaded.graph.nodes[0] as unknown as FunctionNode;
        expect(returnTypeName(restored)).toBe(sinEntry!.outputs[0].valueType);
        expect(returnTypeName(restored)).not.toBe("Unknown");
    });

    it("serializeGraph/deserializeGraph round-trip keeps the return valueType", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);
        const node = createUtilityNode("cross") as unknown as FunctionNode;
        await editor.addNode(node);
        const document = serializeGraph(editor, {}, [node.id]);
        const loaded = deserializeGraph(document, { resolveSpec: () => undefined });
        if (!loaded.ok) {
            throw new Error(loaded.error);
        }
        const restored = loaded.graph.nodes[0] as unknown as FunctionNode;
        expect(returnTypeName(restored)).toBe("Vector");
    });
});
