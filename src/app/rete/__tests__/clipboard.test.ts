/**
 * Editor clipboard (#82): capture/plan/restore without a live rete editor.
 *
 * The snapshot is the contract the paste path relies on, so these tests pin
 * the three things that silently break a copy/paste:
 *   - the wrong nodes being captured (frames, boundary cards, transient ones),
 *   - parameters/spec/math source being lost on the way through `toJSON()`,
 *   - wires surviving with stale ids instead of being remapped.
 */
import { describe, expect, it } from "vitest";
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";

import { FrameNode } from "../nodes/framenode";
import { DefineFeatureNode } from "../nodes/definefeaturenode";
import { OutputFeatureNode } from "../nodes/outputfeaturenode";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
import { MathExpressionNode } from "../nodes/mathexpressionnode";
import type { OnshapeNode } from "../nodes/onshapenode";
import { setUpBoxFeatureSpec } from "../../test-utils/fixtures";
import {
    captureClipboard,
    isClipboardNode,
    planPaste,
    restoreClipboardNode,
    type ClipboardConnectionLike,
} from "../clipboard";

function boxNode(width = 20): CustomFeatureNode {
    const node = new CustomFeatureNode(setUpBoxFeatureSpec() as BTFeatureSpec129);
    node.updateParameter("width", { value: width, units: "millimeter" });
    return node;
}

function defineFeature(): DefineFeatureNode {
    return new DefineFeatureNode({
        annotation: { type: "Feature Type Name", value: "My New Feature" },
        preconditions: [
            {
                annotation: { type: "Property Function Name", value: "do the thing" },
                btType: "BTParameterSpecBoolean-170",
            },
        ],
    });
}

function wire(
    source: OnshapeNode,
    target: OnshapeNode,
    sourceOutput = "context",
    targetInput = "context",
): ClipboardConnectionLike {
    return { source: source.id, sourceOutput, target: target.id, targetInput };
}

const positions = (nodes: readonly OnshapeNode[]) => (id: string) => {
    const index = nodes.findIndex((node) => node.id === id);
    return index < 0 ? null : { x: 100 + index * 40, y: 200 + index * 10 };
};

describe("editor clipboard capture", () => {
    it("never copies frames, boundary cards or transient nodes", () => {
        const chamfer = boxNode();
        const frame = new FrameNode("Body");
        const boundary = defineFeature();
        const output = new OutputFeatureNode();
        const transient = boxNode();
        transient.transient = true;

        for (const node of [frame, boundary, output, transient]) {
            expect(isClipboardNode(node), node.constructor.name).toBe(false);
        }
        expect(isClipboardNode(chamfer)).toBe(true);

        expect(captureClipboard([frame, boundary, output], [], positions([]))).toBeNull();

        const snapshot = captureClipboard([frame, chamfer, output, transient], [], positions([chamfer]));
        expect(snapshot).not.toBeNull();
        expect(snapshot!.entries.map((entry) => entry.originalId)).toEqual([chamfer.id]);
    });

    it("preserves custom-feature parameters and the live spec", () => {
        const chamfer = boxNode(7);
        const snapshot = captureClipboard([chamfer], [], positions([chamfer]));
        expect(snapshot).not.toBeNull();
        const entry = snapshot!.entries[0];

        expect(entry.json.kind).toBe("CustomFeature");
        expect(entry.spec).toBe(chamfer.getFeatureSpec());
        const parameters = (entry.json as { parameters: Record<string, { value: unknown }> }).parameters;
        expect(parameters.width.value).toEqual({ value: 7, units: "millimeter" });

        const restored = restoreClipboardNode(entry, "fresh-id", () => undefined) as CustomFeatureNode;
        expect(restored.id).toBe("fresh-id");
        expect(restored.getTitle()).toBe(chamfer.getTitle());
        expect(restored.getDefinitionInput().paramInputs.width.control.getCurrentValue()).toEqual({
            value: 7,
            units: "millimeter",
        });
    });

    it("preserves math-expression source", () => {
        const math = new MathExpressionNode("2 * PI * radius");
        const snapshot = captureClipboard([math], [], positions([math]));
        const entry = snapshot!.entries[0];
        expect(entry.json).toMatchObject({ kind: "math-expression", source: "2 * PI * radius" });

        const restored = restoreClipboardNode(entry, "math-2", () => undefined) as MathExpressionNode;
        expect(restored.source).toBe("2 * PI * radius");
        expect(restored.getTitle()).toBe(math.getTitle());
    });

    it("drops frame membership because frames are never copied", () => {
        const math = new MathExpressionNode("2 * PI * radius");
        math.group = "frame-source";
        const snapshot = captureClipboard([math], [], positions([math]));
        expect(snapshot!.entries[0].json.group).toBe("frame-source");

        const restored = restoreClipboardNode(snapshot!.entries[0], "math-3", () => undefined);
        expect(restored.group).toBeNull();
    });

    it("keeps only wires whose two endpoints are copied", () => {
        const first = boxNode();
        const second = boxNode();
        const outside = boxNode();
        const connections = [wire(first, second), wire(second, outside)];

        const snapshot = captureClipboard([first, second], connections, positions([first, second]));
        expect(snapshot!.wires).toEqual([wire(first, second)]);

        // Copying the second node alone drops both wires.
        const single = captureClipboard([second], connections, positions([second]));
        expect(single!.entries).toHaveLength(1);
        expect(single!.wires).toEqual([]);
    });

    it("falls back to the origin when a node has no view position", () => {
        const node = boxNode();
        const snapshot = captureClipboard([node], [], () => null);
        expect(snapshot!.entries[0].position).toEqual({ x: 0, y: 0 });
    });
});

describe("editor clipboard paste plan", () => {
    it("gives every pasted node a fresh id and remaps internal wires", () => {
        const first = boxNode();
        const second = boxNode();
        const snapshot = captureClipboard(
            [first, second],
            [wire(first, second, "context", "context")],
            positions([first, second]),
        )!;

        let counter = 0;
        const plan = planPaste(snapshot, { x: 24, y: 24 }, () => `pasted-${++counter}`);

        expect(plan.nodes.map((node) => node.id)).toEqual(["pasted-1", "pasted-2"]);
        const ids = new Set(plan.nodes.map((node) => node.id));
        expect([first.id, second.id].some((id) => ids.has(id))).toBe(false);
        expect(plan.wires).toHaveLength(1);
        expect(plan.wires[0].source).toBe("pasted-1");
        expect(plan.wires[0].target).toBe("pasted-2");
        expect(plan.wires[0].sourceOutput).toBe("context");
        expect(plan.wires[0].targetInput).toBe("context");
    });

    it("cascades repeated pastes by the requested offset", () => {
        const node = boxNode();
        const snapshot = captureClipboard([node], [], positions([node]));

        const first = planPaste(snapshot!, { x: 24, y: 24 }, () => "a");
        const second = planPaste(snapshot!, { x: 48, y: 48 }, () => "b");

        expect(first.nodes[0].position).toEqual({ x: 124, y: 224 });
        expect(second.nodes[0].position).toEqual({ x: 148, y: 248 });
        expect(first.nodes[0].id).not.toBe(second.nodes[0].id);
    });

    it("drops a wire whose endpoint was not part of the snapshot", () => {
        const node = boxNode();
        const snapshot = captureClipboard([node], [], positions([node]))!;
        snapshot.wires.push({ source: node.id, sourceOutput: "context", target: "gone", targetInput: "context" });

        const plan = planPaste(snapshot, { x: 0, y: 0 }, () => "n1");
        expect(plan.nodes).toHaveLength(1);
        expect(plan.wires).toEqual([]);
    });

    it("throws for a kind it cannot rebuild", () => {
        const node = boxNode();
        const snapshot = captureClipboard([node], [], positions([node]))!;
        const entry = { ...snapshot.entries[0], json: { kind: "frame" } as never };
        expect(() => restoreClipboardNode(entry, "x", () => undefined)).toThrow(/cannot restore/);
    });

    it("throws when a custom feature lost its spec", () => {
        const node = boxNode();
        const snapshot = captureClipboard([node], [], positions([node]))!;
        const entry = { ...snapshot.entries[0], spec: null };
        expect(() => restoreClipboardNode(entry, "x", () => undefined)).toThrow(/no feature spec/);
    });
});
