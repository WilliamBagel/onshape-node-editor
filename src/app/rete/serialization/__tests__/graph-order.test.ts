import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NodeEditor } from "rete";
import { Schemes } from "../../types";
import { OutputFeatureNode } from "../../nodes/outputfeaturenode";
import { deserializeGraph, serializeGraph } from "../graph-serializer";
import { GRAPH_SCHEMA_VERSION, SerializedGraph } from "../graph-schema-types";

const resolveSpec = () => undefined;

/** Three plain output-feature nodes: no spec, no controls, all the schema needs. */
async function buildEditor(): Promise<{ editor: NodeEditor<Schemes>; ids: string[] }> {
    const editor = new NodeEditor<Schemes>();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
        const node = new OutputFeatureNode();
        await editor.addNode(node);
        ids.push(node.id);
    }
    return { editor, ids };
}

function withoutOrder(document: SerializedGraph): Omit<SerializedGraph, "nodeOrder"> {
    const { nodeOrder: _ignored, ...rest } = document;
    return rest;
}

describe("graph schema v2 — nodeOrder", () => {
    beforeAll(() => {
        // The node constructors are chatty; keep the test output readable.
        vi.spyOn(console, "log").mockImplementation(() => { });
        vi.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("writes version 2 and the caller's order, bottom-most first", async () => {
        const { editor, ids } = await buildEditor();
        const [a, b, c] = ids;

        const serialized = serializeGraph(editor, {}, [c, a, b]);

        expect(serialized.schemaVersion).toBe(2);
        expect(GRAPH_SCHEMA_VERSION).toBe(2);
        // Paint order only; the node records keep creation order.
        expect(serialized.nodeOrder).toEqual([c, a, b]);
        expect(serialized.nodes.map((node) => node.id)).toEqual([a, b, c]);
    });

    it("falls back to creation order when the caller passes no order", async () => {
        const { editor, ids } = await buildEditor();

        const serialized = serializeGraph(editor);

        expect(serialized.nodeOrder).toEqual(ids);
    });

    it("round-trips the order through JSON", async () => {
        const { editor, ids } = await buildEditor();
        const [a, b, c] = ids;
        const serialized = serializeGraph(editor, {}, [b, c, a]);

        const loaded = deserializeGraph(JSON.parse(JSON.stringify(serialized)), { resolveSpec });
        if (!loaded.ok) {
            throw new Error(`expected the graph to load, got: ${loaded.error}`);
        }

        expect(loaded.graph.nodeOrder).toEqual([b, c, a]);
        expect(loaded.graph.warnings).toEqual([]);
    });

    it("drops ids that are no longer nodes and appends nodes the order does not mention", async () => {
        const { editor, ids } = await buildEditor();
        const [a, b, c] = ids;

        // A stale id from a deleted node, and `c` missing entirely.
        const serialized = serializeGraph(editor, {}, ["ghost", a, b]);

        expect(serialized.nodeOrder).toEqual([a, b, c]);
    });

    it("accepts a version-1 document and derives the order from the nodes array", async () => {
        const { editor, ids } = await buildEditor();
        const [a, b, c] = ids;
        const v2 = serializeGraph(editor, {}, [a, b, c]);

        const v1 = { ...withoutOrder(v2), schemaVersion: 1 };
        const loaded = deserializeGraph(v1, { resolveSpec });

        if (!loaded.ok) {
            throw new Error(`expected a version-1 graph to load, got: ${loaded.error}`);
        }
        expect(loaded.graph.nodeOrder).toEqual([a, b, c]);
        expect(loaded.graph.warnings).toHaveLength(1);
        expect(loaded.graph.warnings[0]).toContain("version-1");
        expect(loaded.graph.warnings[0]).toContain("derived from the nodes array");
    });

    it("appends a node missing from nodeOrder and reports it", async () => {
        const { editor, ids } = await buildEditor();
        const [a, b, c] = ids;
        const document = { ...serializeGraph(editor, {}, [c, b, a]), nodeOrder: [c, b] };

        const loaded = deserializeGraph(document, { resolveSpec });
        if (!loaded.ok) {
            throw new Error(`expected the graph to load, got: ${loaded.error}`);
        }

        expect(loaded.graph.nodeOrder).toEqual([c, b, a]);
        expect(loaded.graph.warnings).toHaveLength(1);
        expect(loaded.graph.warnings[0]).toContain(`"${a}"`);
        expect(loaded.graph.warnings[0]).toContain("appended");
    });

    it("drops an unknown id in nodeOrder and reports it instead of crashing", async () => {
        const { editor, ids } = await buildEditor();
        const [a, b, c] = ids;
        const document = { ...serializeGraph(editor, {}, [a, b, c]), nodeOrder: [b, "ghost", c, a] };

        const loaded = deserializeGraph(document, { resolveSpec });
        if (!loaded.ok) {
            throw new Error(`expected the graph to load, got: ${loaded.error}`);
        }

        expect(loaded.graph.nodeOrder).toEqual([b, c, a]);
        expect(loaded.graph.warnings).toHaveLength(1);
        expect(loaded.graph.warnings[0]).toContain('unknown node "ghost"');
        expect(loaded.graph.warnings[0]).toContain("dropped");
    });

    it("keeps the first position of a duplicated id and reports it", async () => {
        const { editor, ids } = await buildEditor();
        const [a, b, c] = ids;
        const document = { ...serializeGraph(editor, {}, [a, b, c]), nodeOrder: [b, a, b, c] };

        const loaded = deserializeGraph(document, { resolveSpec });
        if (!loaded.ok) {
            throw new Error(`expected the graph to load, got: ${loaded.error}`);
        }

        expect(loaded.graph.nodeOrder).toEqual([b, a, c]);
        expect(loaded.graph.warnings[0]).toContain(`"${b}"`);
        expect(loaded.graph.warnings[0]).toContain("more than once");
    });

    it("still refuses every version it does not write", async () => {
        const { editor } = await buildEditor();
        const document = serializeGraph(editor);

        const missing = deserializeGraph({ nodes: document.nodes, connections: [] }, { resolveSpec });
        expect(missing.ok).toBe(false);
        if (!missing.ok) {
            expect(missing.error).toContain("Unsupported graph schemaVersion: (missing)");
        }

        const fractional = deserializeGraph({ ...document, schemaVersion: 1.5 }, { resolveSpec });
        expect(fractional.ok).toBe(false);
        if (!fractional.ok) {
            expect(fractional.error).toContain("Unsupported graph schemaVersion: 1.5");
        }

        const future = deserializeGraph({ ...document, schemaVersion: 3 }, { resolveSpec });
        expect(future.ok).toBe(false);
        if (!future.ok) {
            expect(future.error).toContain("Unsupported graph schemaVersion: 3");
            expect(future.error).toContain("supports schemaVersion 2");
            expect(future.error).toContain("refusing to load");
        }
    });

    it("refuses a nodeOrder that is not an array of ids", async () => {
        const { editor } = await buildEditor();
        const document = serializeGraph(editor);

        const notAnArray = deserializeGraph({ ...document, nodeOrder: "a,b,c" }, { resolveSpec });
        expect(notAnArray.ok).toBe(false);
        if (!notAnArray.ok) {
            expect(notAnArray.error).toContain('"nodeOrder" must be an array');
        }

        const notStrings = deserializeGraph({ ...document, nodeOrder: [1, 2] }, { resolveSpec });
        expect(notStrings.ok).toBe(false);
        if (!notStrings.ok) {
            expect(notStrings.error).toContain("nodeOrder entry 0 is not a node id string");
        }
    });
});
