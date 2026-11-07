/**
 * #14 group boundary nodes: the visible Start Feature / End Feature cards
 * shown while a group definition is being edited.
 *
 * These cards are definition-owned and permanent (Blender-style): the
 * definition stores stable boundary ids and positions (see
 * GroupDefinition.boundaryNodes, serialized inside the definition), so
 * entering a group always recreates the same two cards at the same place
 * with the same ids — even when the group is empty. They are not ordinary
 * graph nodes: they are never stored as top-level nodes (they stay
 * `transient` so the serializer/snapshot logic omits them), and their
 * sockets are rebuilt from the definition's `inputs`/`outputs`, which
 * remain the single source of truth for sockets.
 *
 * They deliberately emit no FeatureScript: group expansion rewires the
 * instance's external connections directly to the cloned member sockets.
 */
import { ClassicPreset } from "rete";
import { OnshapeOutput } from "../inputoutput/onshapeoutput";
import { OnshapeSocket } from "../onshapesockets";
import { parseValueType } from "../../onshape-utils/valuetypes";
import { OnshapeNode } from "./onshapenode";
import type { GroupDefinition } from "../groups/groupmodel";

export type GroupBoundaryRole = "input" | "output";

export abstract class GroupBoundaryNode extends OnshapeNode {
    protected definition: GroupDefinition;
    public readonly boundaryRole: GroupBoundaryRole;

    protected constructor(type: string, title: string, definition: GroupDefinition, role: GroupBoundaryRole, presetId?: string) {
        super(type, title);
        this.definition = definition;
        this.boundaryRole = role;
        this.transient = true;
        if (presetId != null && presetId !== "") {
            this.id = presetId;
        }
        this.width = 240;
        this.height = 90;
        this.minWidth = 200;
    }

    public getDefinition(): GroupDefinition {
        return this.definition;
    }

    public setDefinition(definition: GroupDefinition): void {
        this.definition = definition;
        this.rebuildSockets();
    }

    /** Rebuild the visible sockets from the current boundary definition. */
    public abstract rebuildSockets(): void;

    public getVariableSymbols(): string[] {
        return [];
    }

    public getFeatureScriptInfo(): { line: string } {
        return { line: "" };
    }
}

function socketValueType(name: string | undefined): ReturnType<typeof parseValueType> | undefined {
    return name != null && name !== "" ? parseValueType(name) : undefined;
}

/** Start Feature: outputs for every declared group input. */
export class GroupInputNode extends GroupBoundaryNode {
    constructor(definition: GroupDefinition, presetId?: string) {
        super("group-input", "Start Feature", definition, "input", presetId);
        this.rebuildSockets();
    }

    public rebuildSockets(): void {
        for (const key of Object.keys(this.outputs)) {
            this.removeOutput(key);
        }
        for (const socket of this.definition.inputs) {
            this.addOutput(
                socket.id,
                new OnshapeOutput(
                    new OnshapeSocket(socket.label, socketValueType(socket.valueType)),
                    socket.label,
                ),
            );
        }
    }
}

/** End Feature: inputs for every declared group output. */
export class GroupOutputNode extends GroupBoundaryNode {
    constructor(definition: GroupDefinition, presetId?: string) {
        super("group-output", "End Feature", definition, "output", presetId);
        this.rebuildSockets();
    }

    public rebuildSockets(): void {
        for (const key of Object.keys(this.inputs)) {
            this.removeInput(key);
        }
        for (const socket of this.definition.outputs) {
            this.addInput(
                socket.id,
                new ClassicPreset.Input(
                    new OnshapeSocket(socket.label, socketValueType(socket.valueType)),
                    socket.label,
                ),
            );
        }
    }
}
