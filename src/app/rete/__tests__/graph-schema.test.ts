import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";
import { Schemes, Connection } from "../types";
import { StyleSettings } from "../stylesettings";
import { DefineFeatureNode } from "../nodes/definefeaturenode";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
import { OutputFeatureNode } from "../nodes/outputfeaturenode";
import { generateFeatureStudioSource } from "../graph-codegen";
import { applyGraph, connectGraphNodes, deserializeGraph, serializeGraph } from "../serialization/graph-serializer";
import { GRAPH_SCHEMA_VERSION, FeatureSpecReference } from "../serialization/graph-schema-types";

/**
 * A feature spec as Onshape returns it from `getFeatureStudioSpecs`, trimmed to
 * what the node editor reads. The graph stores a *reference* to this, so the
 * resolver is the only place the body may live.
 */
const FIXTURE_SPEC: BTFeatureSpec129 = {
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
        {
            btType: "BTParameterSpecQuantity-173",
            parameterId: "width",
            parameterName: "Width",
            defaultValue: { btType: "BTMParameterQuantity-147", value: 1, units: "mm" },
        },
        {
            btType: "BTParameterSpecBoolean-170",
            parameterId: "flipDirection",
            parameterName: "Flip direction",
            defaultValue: { btType: "BTMParameterBoolean-144", value: false },
        },
        {
            btType: "BTParameterSpecEnum-171",
            parameterId: "mode",
            parameterName: "Mode",
            enumName: "ChamferMode",
            options: ["EQUAL_OFFSETS", "TWO_OFFSETS"],
            optionNames: ["Equal offsets", "Two offsets"],
            optionIconUris: [],
            defaultValue: { value: "EQUAL_OFFSETS" },
        },
    ],
} as unknown as BTFeatureSpec129;

const resolveSpec = (ref: FeatureSpecReference): BTFeatureSpec129 | undefined =>
    ref.featureType === FIXTURE_SPEC.featureType ? FIXTURE_SPEC : undefined;

async function addConnection(
    editor: NodeEditor<Schemes>,
    source: DefineFeatureNode | CustomFeatureNode | OutputFeatureNode,
    sourceOutput: string,
    target: DefineFeatureNode | CustomFeatureNode | OutputFeatureNode,
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

/**
 * define-feature -> chamfer -> output-feature
 *
 * The chamfer's `width` is moved off its default so the test proves parameter
 * values are read from the controls and survive the round trip.
 */
async function buildFixtureGraph(): Promise<{ editor: NodeEditor<Schemes>; engine: DataflowEngine<Schemes> }> {
    const editor = new NodeEditor<Schemes>();
    // Installed before any node exists: DataflowEngine registers nodes from
    // `nodecreated`, exactly as `editorBase` does at app startup.
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);

    const definition = new DefineFeatureNode({
        annotation: { type: "Feature Type Name", value: "My New Feature" },
        preconditions: [
            {
                annotation: { type: "Property Function Name", value: "do the thing" },
                btType: "BTParameterSpecBoolean-170",
            },
        ],
    });
    const chamfer = new CustomFeatureNode(FIXTURE_SPEC);
    chamfer.updateParameter("width", { value: 2, units: "mm" });
    const end = new OutputFeatureNode();

    await editor.addNode(definition);
    await editor.addNode(chamfer);
    await editor.addNode(end);

    await addConnection(editor, definition, "context", chamfer, "context");
    await addConnection(editor, chamfer, "context", end, "context");

    return { editor, engine };
}

const FIXTURE_POSITIONS = {
    "define": { x: 0, y: 50 },
    "chamfer": { x: 300, y: 50 },
    "output": { x: 900, y: 50 },
} as const;

function positionsFor(editor: NodeEditor<Schemes>): Record<string, { x: number; y: number }> {
    const ids = editor.getNodes().map((node) => node.id);
    return {
        [ids[0]]: FIXTURE_POSITIONS.define,
        [ids[1]]: FIXTURE_POSITIONS.chamfer,
        [ids[2]]: FIXTURE_POSITIONS.output,
    };
}

describe("graph schema v1", () => {
    beforeAll(() => {
        // The generator and the node constructors are chatty; keep the test output readable.
        vi.spyOn(console, "log").mockImplementation(() => { });
        vi.spyOn(console, "warn").mockImplementation(() => { });
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("round-trips a fixture graph to byte-identical FeatureScript", async () => {
        const { editor, engine } = await buildFixtureGraph();
        const originalSource = await generateFeatureStudioSource(editor, engine);

        expect(originalSource).toBeDefined();
        expect(originalSource).toContain("export const myNewFeature = defineFeature");
        expect(originalSource).toContain('"width": 2 * mm');

        const serialized = serializeGraph(editor, positionsFor(editor));

        // The document must survive an actual JSON round trip, not just an object copy.
        const loaded = deserializeGraph(JSON.parse(JSON.stringify(serialized)), { resolveSpec });
        if (!loaded.ok) {
            throw new Error(`expected the fixture graph to load, got: ${loaded.error}`);
        }

        const restoredEditor = new NodeEditor<Schemes>();
        const restoredEngine = new DataflowEngine<Schemes>();
        restoredEditor.use(restoredEngine);
        await applyGraph(restoredEditor, loaded.graph);

        expect(restoredEditor.getNodes().map((node) => node.id)).toEqual(editor.getNodes().map((node) => node.id));
        expect(restoredEditor.getConnections().length).toBe(editor.getConnections().length);

        const restoredSource = await generateFeatureStudioSource(restoredEditor, restoredEngine);

        // Byte-identical source, not merely equal object shapes.
        expect(restoredSource).toBe(originalSource);
    });

    it("stores the spec as a reference and parameter values by parameter id", async () => {
        const { editor } = await buildFixtureGraph();
        const serialized = serializeGraph(editor, positionsFor(editor));

        expect(serialized.schemaVersion).toBe(GRAPH_SCHEMA_VERSION);

        const customFeature = serialized.nodes.find((node) => node.kind === "CustomFeature");
        if (customFeature == null || customFeature.kind !== "CustomFeature") {
            throw new Error("fixture graph has no CustomFeature node");
        }

        expect(customFeature.spec).toEqual({
            did: null,
            wvm: null,
            wvmid: null,
            eid: "6e648f0784c53a069512657b",
            featureType: "chamfer",
            microversion: "b47f14f24a7f43d8495cb724",
        });
        // No spec body anywhere in the document.
        expect(JSON.stringify(serialized)).not.toContain("BTParameterSpecQuery-174");

        expect(customFeature.parameters.width).toEqual({ type: "ValueWithUnits", value: { value: 2, units: "mm" } });
        expect(customFeature.parameters.flipDirection).toEqual({ type: "Boolean", value: false });
        expect(customFeature.parameters.mode).toEqual({ type: "Enum", value: "EQUAL_OFFSETS" });
        // DR-001: a QueryList never persists captured selections.
        expect(customFeature.parameters.entities).toEqual({ type: "QueryList", value: [] });

        // size/group/position are part of the schema
        expect(customFeature.size.width).toBeGreaterThan(0);
        expect(customFeature.group).toBeNull();
        expect(customFeature.position).toEqual({ x: 300, y: 50 });
    });

    it("refuses an unsupported schemaVersion with a clear error and loads nothing", async () => {
        const { editor } = await buildFixtureGraph();
        const serialized = serializeGraph(editor, positionsFor(editor));

        const unsupported = { ...serialized, schemaVersion: GRAPH_SCHEMA_VERSION + 1 };
        const resolver = vi.fn(resolveSpec);

        const result = deserializeGraph(unsupported, { resolveSpec: resolver });

        expect(result.ok).toBe(false);
        if (result.ok) {
            throw new Error("expected an unsupported version to be refused");
        }
        expect(result.error).toContain(`Unsupported graph schemaVersion: ${GRAPH_SCHEMA_VERSION + 1}`);
        expect(result.error).toContain(`supports schemaVersion ${GRAPH_SCHEMA_VERSION}`);
        expect(result.error).toContain("refusing to load");
        // Refusal happens before any node is built or any spec is resolved.
        expect(resolver).not.toHaveBeenCalled();
    });

    it("refuses a missing schemaVersion and an unknown node kind", () => {
        const noVersion = deserializeGraph({ nodes: [], connections: [] }, { resolveSpec });
        expect(noVersion.ok).toBe(false);
        if (!noVersion.ok) {
            expect(noVersion.error).toContain("Unsupported graph schemaVersion: (missing)");
        }

        const unknownKind = deserializeGraph(
            {
                schemaVersion: GRAPH_SCHEMA_VERSION,
                nodes: [
                    {
                        id: "n1",
                        kind: "mystery-node",
                        position: null,
                        size: { width: 10, height: 10 },
                        group: null,
                    },
                ],
                connections: [],
            },
            { resolveSpec }
        );
        expect(unknownKind.ok).toBe(false);
        if (!unknownKind.ok) {
            expect(unknownKind.error).toContain('unknown kind "mystery-node"');
        }
    });
});
