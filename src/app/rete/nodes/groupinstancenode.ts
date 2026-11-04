/**
 * #14: a placed instance of a node group. Exposes exactly the definition's
 * boundary sockets (in definition order, with the definition's labels), so
 * one definition can be placed any number of times. Codegen inlines the
 * definition (see ../groups/group-expand.ts); this node itself emits no
 * lines — its boundary sockets are rewired to the inlined member nodes.
 */
import { ClassicPreset } from "rete";
import { OnshapeNode } from "./onshapenode";
import { OnshapeSocket } from "../onshapesockets";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { parseValueType } from "../../onshape-utils/valuetypes";
import type { GroupDefinition } from "../groups/groupmodel";
import type { SerializedGroupInstanceNode, SerializedNodeBase } from "../serialization/graph-schema-types";

export class GroupNode extends OnshapeNode {
    public readonly definitionId: string;
    private definition: GroupDefinition;

    constructor(definition: GroupDefinition, muted = false) {
        super("group-instance", definition.name);
        this.definition = definition;
        this.definitionId = definition.id;
        this.muted = muted;
        this.rebuildSockets();
    }

    public getDefinition(): GroupDefinition {
        return this.definition;
    }

    /** Rebind to a definition object (e.g. the edited one, after a snapshot restore). */
    public setDefinition(definition: GroupDefinition): void {
        this.definition = definition;
        this.rebuildSockets();
    }

    /** Rebuild the exposed sockets from the definition (after rename/reorder edits). */
    public rebuildSockets(): void {
        for (const key of Object.keys(this.inputs)) {
            this.removeInput(key);
        }
        for (const key of Object.keys(this.outputs)) {
            this.removeOutput(key);
        }
        for (const socket of this.definition.inputs) {
            const valueType = socket.valueType != null ? parseValueType(socket.valueType) : undefined;
            this.addInput(socket.id, new ClassicPreset.Input(new OnshapeSocket(socket.label, valueType), socket.label));
        }
        for (const socket of this.definition.outputs) {
            const valueType = socket.valueType != null ? parseValueType(socket.valueType) : undefined;
            this.addOutput(socket.id, new OnshapeOutput(new OnshapeSocket(socket.label, valueType), socket.label));
        }
    }

    public getVariableSymbols(): string[] {
        return Object.keys(this.outputs);
    }

    public getFeatureScriptInfo(_variableMapping: Record<string, string>): { line: string } {
        // Inlined by group-expand.ts; a muted instance emits nothing.
        return { line: "" };
    }

    public toJSON(): SerializedGroupInstanceNode {
        return {
            ...(super.toJSON() as SerializedNodeBase),
            kind: "group-instance",
            definitionId: this.definitionId,
            ...(this.muted ? { muted: true } : {}),
        } as SerializedGroupInstanceNode;
    }

    public static fromJSON(data: SerializedGroupInstanceNode, definition: GroupDefinition): GroupNode {
        const node = new GroupNode(definition, data.muted === true);
        node.applySerializedBase(data);
        return node;
    }
}
