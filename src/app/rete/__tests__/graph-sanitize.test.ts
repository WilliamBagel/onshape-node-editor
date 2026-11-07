/**
 * graph-sanitize: only genuinely invalid/orphaned nodes are pruned.
 * Boundary cards inside group editing, muted nodes, and empty-line value
 * nodes must survive; orphaned boundary cards, duplicate ids, spec-less
 * CustomFeature nodes and line-throwing nodes must not.
 */
import { describe, expect, it } from "vitest";
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";
import { NodeEditor } from "rete";
import { sanitizeGraphNodes, pruneInvalidNodes } from "../graph-sanitize";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
import { DefineFeatureNode } from "../nodes/definefeaturenode";
import { OutputFeatureNode } from "../nodes/outputfeaturenode";
import { GroupInputNode, GroupOutputNode } from "../nodes/groupboundarynode";
import { createGroupDefinition } from "../groups/groupmodel";
import { OnshapeNode } from "../nodes/onshapenode";
import type { Schemes } from "../types";

const SPEC = {
    featureType: "chamfer",
    featureTypeName: "Chamfer",
    namespace: "ns::id",
    languageVersion: 2770,
    parameters: [],
} as unknown as BTFeatureSpec129;

function defineNode() {
    return new DefineFeatureNode({
        annotation: { type: "Feature Type Name", value: "My Feature" },
        preconditions: [],
    } as never);
}

/** Minimal stand-in carrying just what the sanitizer reads. */
function stubNode(id: string, type: string, overrides: Partial<OnshapeNode> = {}): OnshapeNode {
    return {
        id,
        type,
        transient: false,
        muted: false,
        getFeatureScriptInfo: () => ({ line: "x;" }),
        getTitle: () => type,
        ...overrides,
    } as unknown as OnshapeNode;
}

describe("sanitizeGraphNodes", () => {
    it("keeps the default sample shape (2 feature nodes + define + output)", () => {
        const nodes = [new CustomFeatureNode(SPEC), new CustomFeatureNode(SPEC), defineNode(), new OutputFeatureNode()];
        const report = sanitizeGraphNodes(nodes, { inGroupEdit: false });
        expect(report.pruned).toEqual([]);
        expect(report.kept).toHaveLength(4);
    });

    it("prunes orphaned boundary cards outside group editing", () => {
        const definition = createGroupDefinition("g1", "Group 1");
        const input = new GroupInputNode(definition);
        const output = new GroupOutputNode(definition);
        const report = sanitizeGraphNodes([defineNode(), input, output], { inGroupEdit: false });
        expect(report.pruned.map((p) => p.type)).toEqual(["group-input", "group-output"]);
        expect(report.kept.map((n) => n.type)).toEqual(["define-feature"]);
        expect(report.pruned[0].reason).toMatch(/orphaned/);
    });

    it("keeps boundary cards while editing a group", () => {
        const definition = createGroupDefinition("g1", "Group 1");
        const input = new GroupInputNode(definition);
        const output = new GroupOutputNode(definition);
        const report = sanitizeGraphNodes([input, output], { inGroupEdit: true });
        expect(report.pruned).toEqual([]);
        expect(report.kept).toHaveLength(2);
    });

    it("prunes the later duplicate id only", () => {
        const a = stubNode("same", "CustomFeature");
        const b = stubNode("same", "CustomFeature");
        const report = sanitizeGraphNodes([a, b], { inGroupEdit: false });
        expect(report.kept).toEqual([a]);
        expect(report.pruned).toHaveLength(1);
        expect(report.pruned[0].reason).toMatch(/duplicate/);
    });

    it("prunes a CustomFeature node with an unresolved spec", () => {
        const node = new CustomFeatureNode(SPEC);
        (node as unknown as { featureSpec: unknown }).featureSpec = null;
        const report = sanitizeGraphNodes([node, defineNode()], { inGroupEdit: false });
        expect(report.pruned.map((p) => p.type)).toEqual(["CustomFeature"]);
        expect(report.pruned[0].reason).toMatch(/missing\/unresolved feature spec/);
        expect(report.kept.map((n) => n.type)).toEqual(["define-feature"]);
    });

    it("prunes nodes that cannot produce a FeatureScript line", () => {
        const broken = stubNode("broken", "CustomFeature", {
            getFeatureScriptInfo: () => {
                throw new Error("boom");
            },
        });
        const report = sanitizeGraphNodes([broken, defineNode()], { inGroupEdit: false });
        expect(report.pruned).toHaveLength(1);
        expect(report.pruned[0].reason).toMatch(/cannot produce a FeatureScript line/);
    });

    it("keeps empty-line and muted nodes (with a warning for the former)", () => {
        const emptyLine = stubNode("empty", "math-expression", { getFeatureScriptInfo: () => ({ line: "" }) });
        const mutedThrowing = stubNode("muted", "CustomFeature", {
            muted: true,
            getFeatureScriptInfo: () => {
                throw new Error("muted nodes are not emitted");
            },
        });
        const report = sanitizeGraphNodes([emptyLine, mutedThrowing], { inGroupEdit: false });
        expect(report.pruned).toEqual([]);
        expect(report.kept).toHaveLength(2);
        expect(report.warnings).toHaveLength(1);
        expect(report.warnings[0]).toMatch(/produces no FeatureScript line/);
    });
});

describe("pruneInvalidNodes", () => {
    it("removes pruned nodes from the editor and logs each with its reason", async () => {
        const editor = new NodeEditor<Schemes>();
        const definition = createGroupDefinition("g1", "Group 1");
        const input = new GroupInputNode(definition);
        const define = defineNode();
        await editor.addNode(input as never);
        await editor.addNode(define as never);
        const logs: string[] = [];
        const report = await pruneInvalidNodes(editor, { inGroupEdit: false }, (entry) => logs.push(entry.message));
        expect(report.pruned).toHaveLength(1);
        expect(editor.getNodes().map((n) => n.id)).toEqual([define.id]);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatch(/Pruned invalid node "group-input"/);
        expect(logs[0]).toMatch(/orphaned/);
    });
});
