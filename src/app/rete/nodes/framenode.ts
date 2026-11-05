import { OnshapeNode } from "./onshapenode";
import type {
    SerializedFrame,
    SerializedNodeBase,
} from "../serialization/graph-schema-types";

/** Accent used for a frame's chrome unless the user picks another colour. */
export const DEFAULT_FRAME_COLOR = "#2f5f8f";

/**
 * #13 grouping v1: a frame is a plain rete node the scopes plugin can parent
 * other nodes to, but it has no inputs/outputs, so the codegen flattening
 * (which walks connection parents from the output node) can never reach it —
 * frames are presentation only. `group` on a child node holds the frame's id;
 * a frame's own `group` is its parent frame's id (nested frames).
 *
 * Frames serialize separately from the `nodes` array (see
 * `SerializedGraph.frames`); `FrameNode.fromJSON` rebuilds one.
 */
export class FrameNode extends OnshapeNode {
    /** Display label, shown in the frame header and editable there. */
    public label: string = "Frame";
    /** Header accent colour (hex). */
    public color: string = DEFAULT_FRAME_COLOR;
    /**
     * Legacy compatibility field only. Frame collapsing was removed: frames
     * always stay expanded so descendants can never be hidden. The field is
     * kept so old serialized documents (`collapsed: true`) still parse, but
     * every construction path normalizes it to false.
     */
    public collapsed: boolean = false;

    /**
     * Legacy canvas-side collapse hook. Never invoked: collapsing is
     * disabled, so there is nothing for the canvas to hide or show. Kept so
     * old programmatic callers fail quiet instead of throwing.
     */
    public onCollapsedChanged: ((collapsed: boolean) => void) | null = null;

    constructor(label: string = "Frame") {
        super("frame", label);
        this.label = label;
        this.collapsed = false;
        this.width = 320;
        this.height = 200;
    }

    public setTitle(newTitle: string): void {
        this.label = newTitle;
        super.setTitle(newTitle);
    }

    /** Fields `serializeGraph` writes for a frame (position filled in there). */
    public toFrameJSON(): SerializedFrame {
        return {
            id: this.id,
            label: this.label,
            color: this.color,
            // Frames can never be collapsed (collapse was removed); always
            // serialize expanded so reloads cannot resurrect hidden nodes.
            collapsed: false,
            position: null,
            size: { width: this.width, height: this.height },
            group: this.group,
        };
    }

    public static fromJSON(data: SerializedFrame): FrameNode {
        const node = new FrameNode(data.label);
        // `kind` is unused by applySerializedBase (frames are not in the
        // codegen node union), so supply the base fields only.
        node.applySerializedBase({
            id: data.id,
            position: data.position,
            size: data.size,
            group: data.group,
        } as SerializedNodeBase);
        node.label = data.label;
        node.color = data.color;
        // Old documents may carry `collapsed: true`; they load expanded.
        node.collapsed = false;
        node.setTitle(data.label);
        return node;
    }
}
