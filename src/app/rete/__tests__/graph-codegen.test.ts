import { beforeAll, describe, expect, it, vi } from "vitest";
import { NodeEditor } from "rete";
import { DataflowEngine } from "rete-engine";
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";
import { Schemes, Connection } from "../types";
import { StyleSettings } from "../stylesettings";
import { DefineFeatureNode } from "../nodes/definefeaturenode";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
import { OutputFeatureNode } from "../nodes/outputfeaturenode";
import { generateFeatureStudioSource } from "../graph-codegen";
import { findFeatureScriptStructureError } from "../../onshape-utils/featurescriptstructure";
import { connectGraphNodes } from "../serialization/graph-serializer";

/**
 * Reconciliation test for the #3/#5 merge.
 *
 * #3 moved the top-level `var` emission into `assembleFeatureScriptInfo`
 * (`pipelineinfo.ts`) and unit-tested that function directly. #5 moved the
 * generator driver out of `editorBase` into `graph-codegen.ts`. The merge kept
 * #5's structure and ported #3's change into it, so neither card's suite covers
 * the *real* path: `assembleFeatureScriptInfo` called from
 * `generateFeatureStudioSource`.
 *
 * A top-level variable only arises from a `QueryList` parameter that holds
 * selections (see `OnshapeFeatureSpecInput.getTopLevelVariables`), which is why
 * the round-trip fixture in `graph-schema.test.ts` never produces one. This test
 * sets a selection on the control so the real path has something to emit.
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

describe("generateFeatureStudioSource", () => {
    beforeAll(() => {
        vi.spyOn(console, "log").mockImplementation(() => { });
        vi.spyOn(console, "warn").mockImplementation(() => { });
    });

    it("emits a top-level variable declared by a node, through the real path", async () => {
        const editor = new NodeEditor<Schemes>();
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
        // A QueryList with a selection is what makes the node declare a top-level
        // variable; with no selections `getTopLevelVariables()` returns nothing.
        chamfer.updateParameter("entities", [{ selectionId: "sel1" }]);
        const end = new OutputFeatureNode();

        await editor.addNode(definition);
        await editor.addNode(chamfer);
        await editor.addNode(end);
        await addConnection(editor, definition, "context", chamfer, "context");
        await addConnection(editor, chamfer, "context", end, "context");

        const source = await generateFeatureStudioSource(editor, engine);

        expect(source).toBeDefined();
        const variableLines = (source as string)
            .split("\n")
            .filter((line) => line.trim().startsWith("var entities ="));

        expect(variableLines).toHaveLength(1);
        expect(variableLines[0]).toContain("qTransient('sel1')");
    });

    /**
     * The dev default graph (src/app/rete/devEditor.ts) adds two Chamfer nodes,
     * one Define Feature and one End Feature with no connections at all. Every
     * node except the End Feature is a leaf, so `ReteOnshapeNodeProcessor`
     * prunes them and the generator used to return a header plus one orphan
     * `});` (181 bytes) that Build reported as success.
     */
    it("refuses the unwired default graph: no Define Feature chain", async () => {
        const editor = new NodeEditor<Schemes>();
        const engine = new DataflowEngine<Schemes>();
        editor.use(engine);

        await editor.addNode(new CustomFeatureNode(FIXTURE_SPEC));
        await editor.addNode(new CustomFeatureNode(FIXTURE_SPEC));
        await editor.addNode(new DefineFeatureNode({
            annotation: { type: "Feature Type Name", value: "My New Feature" },
            preconditions: [
                {
                    annotation: { type: "Property Function Name", value: "entities" },
                    btType: "BTParameterSpecQuery-174",
                },
            ],
        } as never));
        await editor.addNode(new OutputFeatureNode());

        const build = generateFeatureStudioSource(editor, engine);

        await expect(build).rejects.toThrowError(/structurally invalid/);
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(/Define Feature/);
        await expect(generateFeatureStudioSource(editor, engine)).rejects.toThrowError(/End Feature/);
    });

    it("still builds a wired Define Feature -> End Feature graph", async () => {
        const editor = new NodeEditor<Schemes>();
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

        await editor.addNode(definition);
        await editor.addNode(chamfer);
        await editor.addNode(end);
        await addConnection(editor, definition, "context", chamfer, "context");
        await addConnection(editor, chamfer, "context", end, "context");

        const source = (await generateFeatureStudioSource(editor, engine)) as string;

        expect(source).toContain("defineFeature(");
        expect(source.match(/^\}\);$/gm)).toHaveLength(1);
        expect(findFeatureScriptStructureError(source)).toBeUndefined();
    });
});
