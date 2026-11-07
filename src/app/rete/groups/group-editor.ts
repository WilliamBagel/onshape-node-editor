/**
 * #14: group editing mode (Tab enter/exit), as a headless controller.
 *
 * Entering an instance snapshots the whole main graph (serialized document
 * plus canvas positions), removes it, and puts the definition's member
 * nodes in the editor. Exiting captures the members' positions and
 * internal connections back into the definition, removes them, and restores
 * the snapshot — so entering/leaving never loses node positions or external
 * connections. The snapshot/restore and position plumbing are callbacks,
 * because the canvas (area plugin) owns positions in the app; tests supply
 * headless versions of the same callbacks.
 *
 * Nesting: entering an instance inside an edited group pushes another
 * level; exiting always returns one level, restoring the parent group's
 * members. `breadcrumb()` renders the toolbar trail.
 */
import type { NodeEditor } from "rete";
import type { Schemes } from "../types";
import { GroupNode } from "../nodes/groupinstancenode";
import { GroupInputNode, GroupOutputNode } from "../nodes/groupboundarynode";
import type { OnshapeNode } from "../nodes/onshapenode";
import { Connection } from "../types";
import { StyleSettings } from "../stylesettings";
import { connectGraphNodes } from "../serialization/graph-serializer";
import {
    addGroupSocket,
    listGroupSocketCandidates,
    removeGroupSocket,
    updateGroupSocket,
    type GroupDefinition,
    type GroupSocketCandidate,
    type GroupSocketPatch,
} from "./groupmodel";
import type { Vec2 } from "../serialization/graph-schema-types";

export interface GroupSnapshot {
    document: string;
    positions: Record<string, Vec2 | null>;
    /** Feature specs referenced by CustomFeature nodes in the snapshot. */
    specs?: Record<string, unknown>;
}

export interface GroupEditHost {
    /** Serialize the current editor contents (document + positions). */
    snapshot: () => GroupSnapshot;
    /** Replace the editor contents with a snapshot taken by `snapshot()`. */
    restore: (snap: GroupSnapshot) => Promise<void>;
    /** Current canvas positions, by node id. */
    getPositions: () => Record<string, Vec2 | null>;
    /** Place nodes at the given canvas positions, by node id. */
    setPositions: (positions: Record<string, Vec2 | null>) => Promise<void>;
}

interface EditLevel {
    instanceId: string;
    definition: GroupDefinition;
    snapshot: GroupSnapshot;
    /** Frame memberships temporarily removed while their owner frame is not in the editor. */
    memberFrames: Record<string, string | null>;
    /** Visible Start/End cards for this level (removed on exit). */
    boundaryInput: GroupInputNode | null;
    boundaryOutput: GroupOutputNode | null;
}

export interface GroupBoundaryState {
    definitionId: string;
    name: string;
    inputs: GroupDefinition["inputs"];
    outputs: GroupDefinition["outputs"];
    candidates: {
        inputs: GroupSocketCandidate[];
        outputs: GroupSocketCandidate[];
    } | null;
    boundaryNodeIds: { input: string | null; output: string | null };
}

export class GroupEditorController {
    private readonly levels: EditLevel[] = [];
    private groupInput: GroupInputNode | null = null;
    private groupOutput: GroupOutputNode | null = null;

    constructor(
        private readonly editor: NodeEditor<Schemes>,
        private readonly host: GroupEditHost,
    ) {}

    /** Breadcrumb trail, outermost first: ["Top level", ...group names]. */
    breadcrumb(): string[] {
        return ["Top level", ...this.levels.map((level) => level.definition.name)];
    }

    get depth(): number {
        return this.levels.length;
    }

    get currentDefinition(): GroupDefinition | null {
        return this.levels.length > 0 ? this.levels[this.levels.length - 1].definition : null;
    }

    /** Enter the group instance `instanceId` (must be in the editor now). */
    async enter(instanceId: string): Promise<boolean> {
        const node = this.editor.getNode(instanceId);
        if (!(node instanceof GroupNode)) {
            return false;
        }
        const definition = node.getDefinition();
        const snapshot = this.host.snapshot();
        const level: EditLevel = {
            instanceId,
            definition,
            snapshot,
            memberFrames: {},
            boundaryInput: null,
            boundaryOutput: null,
        };
        this.levels.push(level);

        // Connections first: `removeNode` alone leaves them behind.
        for (const connection of [...this.editor.getConnections()]) {
            await this.editor.removeConnection(connection.id);
        }
        for (const current of [...this.editor.getNodes()]) {
            await this.editor.removeNode(current.id);
        }
        for (const member of definition.nodes) {
            // The outer frame is not part of the group editor; a stale parent
            // id would make the scopes plugin try to fit a frame that is not
            // here. Restore these memberships on exit.
            level.memberFrames[member.id] = member.group;
            member.group = null;
            await this.editor.addNode(member);
        }
        // Rebuild the definition's internal connections between members.
        const styleSettings = new StyleSettings();
        for (const connection of definition.connections) {
            const source = this.editor.getNode(connection.source);
            const target = this.editor.getNode(connection.target);
            if (source == null || target == null) {
                continue;
            }
            const rebuilt = new Connection(
                source,
                connection.sourceOutput,
                source.outputs[connection.sourceOutput]?.socket.name ?? connection.sourceOutput,
                target,
                connection.targetInput,
                target.inputs[connection.targetInput]?.socket.name ?? connection.targetInput,
                styleSettings,
            );
            await this.editor.addConnection(rebuilt);
            connectGraphNodes(this.editor, rebuilt);
        }
        await this.host.setPositions({ ...definition.positions });
        await this.createBoundaryNodes(definition);
        level.boundaryInput = this.groupInput;
        level.boundaryOutput = this.groupOutput;
        return true;
    }

    /** Current boundary state for the group editor UI, or null at the top level. */
    boundaryState(): GroupBoundaryState | null {
        const definition = this.currentDefinition;
        if (definition == null) {
            return null;
        }
        const candidates = listGroupSocketCandidates(definition);
        return {
            definitionId: definition.id,
            name: definition.name,
            inputs: definition.inputs,
            outputs: definition.outputs,
            candidates,
            boundaryNodeIds: {
                input: this.groupInput?.id ?? null,
                output: this.groupOutput?.id ?? null,
            },
        };
    }

    /** Add one boundary socket by binding a member input/output socket. */
    async addBoundarySocket(
        direction: "input" | "output",
        nodeId: string,
        socketKey: string,
    ): Promise<boolean> {
        const definition = this.currentDefinition;
        if (definition == null) return false;
        if (addGroupSocket(definition, direction, nodeId, socketKey) == null) {
            return false;
        }
        await this.refreshBoundary();
        return true;
    }

    /** Rename/retype an existing boundary socket. */
    async updateBoundarySocket(socketId: string, patch: GroupSocketPatch): Promise<boolean> {
        const definition = this.currentDefinition;
        if (definition == null) return false;
        if (!updateGroupSocket(definition, socketId, patch)) {
            return false;
        }
        await this.refreshBoundary();
        return true;
    }

    /** Remove a boundary socket from the group interface. */
    async removeBoundarySocket(socketId: string): Promise<boolean> {
        const definition = this.currentDefinition;
        if (definition == null) return false;
        if (!removeGroupSocket(definition, socketId)) {
            return false;
        }
        await this.refreshBoundary();
        return true;
    }

    /** Recreate/repaint the Start Feature and End Feature cards and their wiring. */
    async refreshBoundary(): Promise<void> {
        const definition = this.currentDefinition;
        if (definition == null) return;
        this.groupInput?.setDefinition(definition);
        this.groupOutput?.setDefinition(definition);
        for (const node of this.editor.getNodes()) {
            if (node instanceof GroupNode && node.definitionId === definition.id) {
                node.setDefinition(definition);
            }
        }
        await this.rebuildBoundaryWiring();
    }

    private async createBoundaryNodes(definition: GroupDefinition): Promise<void> {
        this.groupInput = new GroupInputNode(definition);
        this.groupOutput = new GroupOutputNode(definition);
        await this.editor.addNode(this.groupInput);
        await this.editor.addNode(this.groupOutput);
        const memberPositions = Object.values(definition.positions)
            .filter((position): position is Vec2 => position != null);
        const minX = memberPositions.length > 0 ? Math.min(...memberPositions.map((position) => position.x)) : 0;
        const minY = memberPositions.length > 0 ? Math.min(...memberPositions.map((position) => position.y)) : 0;
        const maxX = memberPositions.length > 0 ? Math.max(...memberPositions.map((position) => position.x)) : 640;
        await this.host.setPositions({
            ...definition.positions,
            [this.groupInput.id]: { x: minX - 340, y: minY },
            [this.groupOutput.id]: { x: maxX + 340, y: minY },
        });
        await this.rebuildBoundaryWiring();
    }

    private async rebuildBoundaryWiring(): Promise<void> {
        if (this.groupInput == null || this.groupOutput == null) return;
        const boundaryIds = new Set([this.groupInput.id, this.groupOutput.id]);
        for (const connection of [...this.editor.getConnections()]) {
            if (boundaryIds.has(connection.source) || boundaryIds.has(connection.target)) {
                await this.editor.removeConnection(connection.id);
            }
        }
        const styleSettings = new StyleSettings();
        const connect = async (
            source: OnshapeNode,
            sourceOutput: string,
            target: OnshapeNode,
            targetInput: string,
        ): Promise<void> => {
            const rebuilt = new Connection(
                source,
                sourceOutput,
                source.outputs[sourceOutput]?.socket.name ?? sourceOutput,
                target,
                targetInput,
                target.inputs[targetInput]?.socket.name ?? targetInput,
                styleSettings,
            );
            await this.editor.addConnection(rebuilt);
            connectGraphNodes(this.editor, rebuilt);
        };
        const definition = this.currentDefinition;
        if (definition == null) return;
        for (const socket of definition.inputs) {
            const member = this.editor.getNode(socket.nodeId);
            if (member != null && member.inputs[socket.socketKey] != null) {
                await connect(this.groupInput, socket.id, member, socket.socketKey);
            }
        }
        for (const socket of definition.outputs) {
            const member = this.editor.getNode(socket.nodeId);
            if (member != null && member.outputs[socket.socketKey] != null) {
                await connect(member, socket.socketKey, this.groupOutput, socket.id);
            }
        }
    }

    /**
     * Leave the innermost group: capture member positions/connections into
     * the definition, then restore the snapshot taken on entry.
     */
    async exit(): Promise<boolean> {
        const level = this.levels.pop();
        if (level == null) {
            return false;
        }
        const positions = this.host.getPositions();
        for (const memberId of Object.keys(positions)) {
            if (level.definition.nodes.some((node) => node.id === memberId)) {
                level.definition.positions[memberId] = positions[memberId];
            }
        }
        level.definition.connections = this.editor.getConnections()
            .filter((connection) =>
                level.definition.nodes.some((node) => node.id === connection.source) &&
                level.definition.nodes.some((node) => node.id === connection.target))
            .map((connection) => ({
                source: connection.source,
                sourceOutput: connection.sourceOutput,
                target: connection.target,
                targetInput: connection.targetInput,
            }));

        for (const connection of [...this.editor.getConnections()]) {
            await this.editor.removeConnection(connection.id);
        }
        for (const current of [...this.editor.getNodes()]) {
            await this.editor.removeNode(current.id);
        }
        this.groupInput = null;
        this.groupOutput = null;
        for (const member of level.definition.nodes) {
            member.group = level.memberFrames[member.id] ?? null;
        }
        await this.host.restore(level.snapshot);
        await this.host.setPositions({ ...level.snapshot.positions });
        // The restore rebuilt instance nodes from the snapshot's copy of
        // the definition; rebind them to the edited definition object so
        // edits made in the group session are the ones that survive.
        for (const node of this.editor.getNodes()) {
            if (node instanceof GroupNode && node.definitionId === level.definition.id) {
                node.setDefinition(level.definition);
            }
        }
        // Recreate the parent level's visible Start/End cards after a nested
        // group exit (they were omitted from the snapshot as transient UI).
        const parent = this.levels[this.levels.length - 1];
        if (parent != null) {
            await this.createBoundaryNodes(parent.definition);
            parent.boundaryInput = this.groupInput;
            parent.boundaryOutput = this.groupOutput;
        }
        return true;
    }

    /**
     * Tab behaviour: inside a group, exit one level; otherwise enter the
     * instance `instanceId` (the selected node, when it is an instance).
     */
    async toggle(instanceId?: string): Promise<"entered" | "exited" | "noop"> {
        if (this.levels.length > 0) {
            await this.exit();
            return "exited";
        }
        if (instanceId != null && (await this.enter(instanceId))) {
            return "entered";
        }
        return "noop";
    }
}
