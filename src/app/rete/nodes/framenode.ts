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
    /** When true, descendant node elements are hidden (not deleted). */
    public collapsed: boolean = false;

    /**
     * Canvas-side collapse hook, assigned by `editorbase` (which owns the
     * area). The view toggles `collapsed`, calls `update()`, then this, so
     * hiding/showing children stays behind the view.
     */
    public onCollapsedChanged: ((collapsed: boolean) => void) | null = null;

    constructor(label: string = "Frame") {
        super("frame", label);
        this.label = label;
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
            collapsed: this.collapsed,
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
        node.collapsed = data.collapsed;
        node.setTitle(data.label);
        return node;
    }
}
