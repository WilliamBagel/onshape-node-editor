import { beforeAll, describe, expect, it, vi } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";
import { Schemes, Connection } from "../../types";
import { StyleSettings } from "../../stylesettings";
import { DefineFeatureNode } from "../../nodes/definefeaturenode";
import { CustomFeatureNode } from "../../nodes/customfeaturenode";
import { OutputFeatureNode } from "../../nodes/outputfeaturenode";
import { FrameNode } from "../../nodes/framenode";
import { generateFeatureStudioSource } from "../../graph-codegen";
import { applyGraph, connectGraphNodes, deserializeGraph, serializeGraph } from "../graph-serializer";
import { FeatureSpecReference } from "../graph-schema-types";

/**
 * #13 grouping v1: frames/scopes.
 *
 * Frames are presentation only — the codegen flattening walks connection
 * parents from the output node and a frame has no connections, so generated
 * FeatureScript must be byte-identical with and without frames. The
 * persistence contract is that `group` (the scopes plugin's `parent`) and the
 * frame's label/colour/position survive a save/load round trip. Frame
 * collapsing was removed: `collapsed` is a legacy schema field, always
 * normalized to false, so old documents with `collapsed: true` load expanded.
 *
 * What is NOT covered here: the DOM behaviour (drag the frame, the plugin
 * translates children whose `parent` is the frame's id). That needs a real
 * area plugin and a DOM, and this suite runs in `environment: 'node'`. The
 * headless half of those behaviours — the parent linkage the plugin
 * translates by — is asserted below.
 */
const FIXTURE_SPEC = {
    btType: "BTFeatureSpec-129",
    featureType: "chamfer",
    featureTypeName: "Chamfer",
    namespace: "e6e648f0784c53a069512657b::mb47f14f24a7f43d8495cb724",
    languageVersion: 2770,
    parameters: [
        {
            btType: "BTParameterSpecQuery-174",
            parameterId: "entities",
            parameterName: "Entities to chamfer",
            defaultValue: {
                btType: "BTMParameterQueryList-148",
                nodeId: "Mxz0id6kBZO+9jRYi",
                parameterId: "entities",
                queries: [],
            },
        },
    ],
} as unknown as BTFeatureSpec129;

const resolveSpec = (ref: FeatureSpecReference): BTFeatureSpec129 | undefined =>
    ref.featureType === FIXTURE_SPEC.featureType ? FIXTURE_SPEC : undefined;

async function addConnection(
    editor: NodeEditor<Schemes>,
    source: DefineFeatureNode | CustomFeatureNode,
    sourceOutput: string,
    target: CustomFeatureNode | OutputFeatureNode,
    targetInput: string
): Promise<void> {
    const connection = new Connection(
        source,
        sourceOutput,
        source.outputs[sourceOutput].socket.name,
        target,
        targetInput,
        target.inputs[targetInput].socket.name,
        new StyleSettings()
    );
    await editor.addConnection(connection);
    connectGraphNodes(editor, connection);
}

/** define-feature -> chamfer -> output-feature, plus an optional frame. */
async function buildGraph(withFrame: boolean): Promise<{
    editor: NodeEditor<Schemes>;
    engine: DataflowEngine<Schemes>;
    chamfer: CustomFeatureNode;
    frame: FrameNode | null;
}> {
    const editor = new NodeEditor<Schemes>();
    // Installed before any node exists: DataflowEngine registers nodes from
    // `nodecreated`, exactly as `editorBase` does at app startup.
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);

    const definition = new DefineFeatureNode({
        annotation: { type: "Feature Type Name", value: "My New Feature" },
        preconditions: [
            {
                annotation: { type: "Property Function Name", value: "entities" },
                btType: "BTParameterSpecQuery-174",
            },
        ],
    } as never);
    const chamfer = new CustomFeatureNode(FIXTURE_SPEC);
    const end = new OutputFeatureNode();

    let frame: FrameNode | null = null;
    if (withFrame) {
        frame = new FrameNode("Finishing");
        frame.color = "#b3402e";
        // Simulate a legacy document: collapsing no longer exists, so the
        // flag is force-normalized and never survives a round trip.
        frame.collapsed = true;
        frame.width = 400;
        frame.height = 240;
        // Frames are added first, like a load does: the scopes plugin's
        // validator refuses a grouped node whose parent does not exist yet.
        await editor.addNode(frame);
        chamfer.group = frame.id;
    }

    await editor.addNode(definition);
    await editor.addNode(chamfer);
    await editor.addNode(end);
    await addConnection(editor, definition, "context", chamfer, "context");
    await addConnection(editor, chamfer, "context", end, "context");

    return { editor, engine, chamfer, frame };
}

describe("frames (#13)", () => {
    beforeAll(() => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("`group` and the scopes plugin's `parent` are one field", () => {
        const frame = new FrameNode();
        const chamfer = new CustomFeatureNode(FIXTURE_SPEC);

        chamfer.parent = frame.id;
        expect(chamfer.group).toBe(frame.id);
        expect(chamfer.parent).toBe(frame.id);

        chamfer.group = "some-other-frame";
        expect(chamfer.parent).toBe("some-other-frame");

        chamfer.parent = undefined;
        expect(chamfer.group).toBeNull();
    });

    it("frames survive a save/load round trip, including containment", async () => {
        const { editor, chamfer, frame } = await buildGraph(true);
        expect(frame).not.toBeNull();
        const positions = {
            [frame!.id]: { x: 120, y: 80 },
            [chamfer.id]: { x: 200, y: 160 },
        };

        const document = serializeGraph(editor, positions, []);
        const json = JSON.parse(JSON.stringify(document));
        expect(json.frames).toHaveLength(1);
        expect(json.nodes.map((node: { id: string }) => node.id)).not.toContain(frame!.id);

        const result = deserializeGraph(json, { resolveSpec });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const fresh = new NodeEditor<Schemes>();
        await applyGraph(fresh, result.graph);

        const restored = fresh.getNodes().find((node) => node instanceof FrameNode) as FrameNode;
        expect(restored.id).toBe(frame!.id);
        expect(restored.label).toBe("Finishing");
        expect(restored.color).toBe("#b3402e");
        // The frame was built with the legacy collapsed flag set; collapse
        // was removed, so it loads expanded (flag false) and the grouped
        // node is still there and still parented to the frame.
        expect(restored.collapsed).toBe(false);
        expect(restored.width).toBe(400);

        const restoredChamfer = fresh.getNodes().find((node) => node.id === chamfer.id);
        expect(restoredChamfer?.group).toBe(frame!.id);
        expect(restoredChamfer?.parent).toBe(frame!.id);

        // The linkage the scopes plugin translates children by when a frame
        // moves: children are the nodes whose `parent` is the frame's id.
        const children = fresh.getNodes().filter((node) => node.parent === restored.id);
        expect(children.map((node) => node.id)).toEqual([chamfer.id]);

        // Restored frame position, so the frame lands back around its children.
        expect(result.graph.positions[frame!.id]).toEqual({ x: 120, y: 80 });
        expect(result.graph.positions[chamfer.id]).toEqual({ x: 200, y: 160 });
    });

    it("nested frames round-trip (a frame's group names its parent frame)", async () => {
        const { editor, frame } = await buildGraph(true);
        const outer = new FrameNode("Outer");
        await editor.addNode(outer);
        frame!.group = outer.id;

        const json = JSON.parse(JSON.stringify(serializeGraph(editor, {}, [])));
        const outerJson = json.frames.find((entry: { id: string }) => entry.id === outer.id);
        const innerJson = json.frames.find((entry: { id: string }) => entry.id === frame!.id);
        expect(outerJson.group).toBeNull();
        expect(innerJson.group).toBe(outer.id);

        const result = deserializeGraph(json, { resolveSpec });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.graph.warnings).toEqual([]);
        const restoredInner = result.graph.nodes.find((node) => node.id === frame!.id);
        expect(restoredInner?.group).toBe(outer.id);
    });

    it("frames stay out of nodeOrder, even when the caller hands one in", async () => {
        const { editor, frame } = await buildGraph(true);
        const document = serializeGraph(editor, {}, [frame!.id]);
        const nonFrameIds = editor.getNodes().filter((node) => node.id !== frame!.id).map((node) => node.id);
        expect(document.nodeOrder).toEqual(nonFrameIds);
        expect(document.nodeOrder).not.toContain(frame!.id);
    });

    it("a grouped node whose frame is missing loads ungrouped, with a warning", async () => {
        const { editor, chamfer, frame } = await buildGraph(true);
        const json = JSON.parse(JSON.stringify(serializeGraph(editor, {}, [])));
        delete json.frames;

        const result = deserializeGraph(json, { resolveSpec });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const restored = result.graph.nodes.find((node) => node.id === chamfer.id);
        expect(restored?.group).toBeNull();
        expect(result.graph.warnings.some((warning: string) => warning.includes(frame!.id))).toBe(true);
    });

    it("frames do not change generated FeatureScript", async () => {
        const plain = await buildGraph(false);
        const framed = await buildGraph(true);
        // Give the framed run's chamfer a selection, the way the top-level
        // variable path needs one, so the comparison exercises real output.
        framed.chamfer.updateParameter("entities", [{ selectionId: "sel1" }]);
        plain.chamfer.updateParameter("entities", [{ selectionId: "sel1" }]);

        const plainSource = await generateFeatureStudioSource(plain.editor, plain.engine);
        const framedSource = await generateFeatureStudioSource(framed.editor, framed.engine);

        expect(plainSource).toBeDefined();
        expect(framedSource).toBe(plainSource);
    });

    it("an empty frame does not change generated FeatureScript either", async () => {
        const { editor, engine } = await buildGraph(false);
        await editor.addNode(new FrameNode("Empty"));
        const source = await generateFeatureStudioSource(editor, engine);
        const plain = await buildGraph(false);
        const plainSource = await generateFeatureStudioSource(plain.editor, plain.engine);
        expect(source).toBe(plainSource);
    });

    it("frames are never collapsed: construction normalizes to false", () => {
        const frame = new FrameNode("F");
        expect(frame.collapsed).toBe(false);
        // Even a legacy caller forcing the flag cannot make it stick when
        // the frame is serialized: serialization always reports expanded.
        frame.collapsed = true;
        expect(frame.toFrameJSON().collapsed).toBe(false);
    });

    it("an old document with collapsed=true loads expanded", () => {
        const restored = FrameNode.fromJSON({
            id: "frame-1",
            label: "Legacy",
            color: "#2f5f8f",
            collapsed: true,
            position: { x: 10, y: 20 },
            size: { width: 320, height: 200 },
            group: null,
        });
        expect(restored.collapsed).toBe(false);
        expect(restored.label).toBe("Legacy");
    });
});
