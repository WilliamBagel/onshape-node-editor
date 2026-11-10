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
import { GroupInputNode, GroupOutputNode, GROUP_INPUT_PLACEHOLDER_KEY, GROUP_OUTPUT_PLACEHOLDER_KEY } from "../nodes/groupboundarynode";
import type { OnshapeNode } from "../nodes/onshapenode";
import { FrameNode } from "../nodes/framenode";
import { Connection } from "../types";
import { StyleSettings } from "../stylesettings";
import { connectGraphNodes } from "../serialization/graph-serializer";
import {
    addGroupSocket,
    bindGroupSocket,
    createAnyGroupSocket,
    ensureBoundaryNodes,
    isGroupSocketBound,
    listGroupSocketCandidates,
    removeGroupSocket,
    unbindGroupSocket,
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
    /** Re-measure/repaint a node after its sockets changed. */
    updateNode?: (nodeId: string) => Promise<void>;
    /** Fired after any boundary socket / wiring change so the host can
     * refresh its panel state. Must not write back into the editor
     * (read-only state refresh), so it cannot recurse into this driver. */
    onBoundaryChanged?: () => void;
    /** Wait for socket geometry to settle and force connection views to repaint.
     * Double requestAnimationFrame + connection.socketPositionWatcher.recalcAll()
     * in the real host. Needed after boundary wiring / positions change, otherwise
     * wires paint before the new nodes settle and stay offset until a drag. */
    settleConnections?: () => Promise<void>;
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
    /**
     * Re-entrancy guard: while the controller itself removes/recreates
     * boundary connections (refresh, placeholder replacement, enter/exit
     * teardown), boundary sync must not reinterpret those as user drags —
     * otherwise a refresh would unbind the very sockets it is restoring.
     */
    private suspendBoundarySync = false;

    constructor(
        private readonly editor: NodeEditor<Schemes>,
        private readonly host: GroupEditHost,
    ) {
        // User wiring is authoritative: teach the definition from boundary
        // connections the user draws while editing (see the handlers below).
        this.editor.addPipe(async (context) => {
            if (context.type === "connectioncreated") {
                await this.onBoundaryConnectionCreated(context.data);
            } else if (context.type === "connectionremove") {
                this.onBoundaryConnectionRemoved(context.data);
            }
            return context;
        });
    }

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
        // Suspended: tearing down the outer view must not unbind its wires.
        this.suspendBoundarySync = true;
        try {
            for (const connection of [...this.editor.getConnections()]) {
                await this.editor.removeConnection(connection.id);
            }
        } finally {
            this.suspendBoundarySync = false;
        }
        // Frames must be removed last: the scopes plugin refuses to remove a
        // parent while it still has children. A group instance inside a frame
        // is a child, so it must leave first.
        for (const current of [...this.editor.getNodes()].sort(
            (a, b) => Number(a instanceof FrameNode) - Number(b instanceof FrameNode),
        )) {
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
        await this.host.settleConnections?.();
        return true;
    }

    /** True when `nodeId` is a boundary card of the group being edited. */
    public isBoundaryNode(nodeId: string): boolean {
        const definition = this.currentDefinition;
        if (definition == null) return false;
        const record = ensureBoundaryNodes(definition);
        return nodeId === record.inputId || nodeId === record.outputId;
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
    async updateBoundarySocket(
        socketId: string,
        patch: GroupSocketPatch,
        direction?: "input" | "output",
    ): Promise<boolean> {
        const definition = this.currentDefinition;
        if (definition == null) return false;
        if (!updateGroupSocket(definition, socketId, patch, direction)) {
            return false;
        }
        await this.refreshBoundary();
        return true;
    }

    /** Remove a boundary socket from the group interface. */
    async removeBoundarySocket(socketId: string, direction?: "input" | "output"): Promise<boolean> {
        const definition = this.currentDefinition;
        if (definition == null) return false;
        if (!removeGroupSocket(definition, socketId, direction)) {
            return false;
        }
        await this.refreshBoundary();
        return true;
    }

    /** Rebuild every instance's exposed sockets from the definition. */
    private syncBoundaryInstances(definition: GroupDefinition): void {
        for (const node of this.editor.getNodes()) {
            if (node instanceof GroupNode && node.definitionId === definition.id) {
                node.rebuildSockets();
                void this.host.updateNode?.(node.id);
            }
        }
    }

    /** Add one editor connection (with graph-engine wiring) between nodes. */
    private async connect(
        source: OnshapeNode,
        sourceOutput: string,
        target: OnshapeNode,
        targetInput: string,
    ): Promise<void> {
        const rebuilt = new Connection(
            source,
            sourceOutput,
            source.outputs[sourceOutput]?.socket.name ?? sourceOutput,
            target,
            targetInput,
            target.inputs[targetInput]?.socket.name ?? targetInput,
            new StyleSettings(),
        );
        await this.editor.addConnection(rebuilt);
        connectGraphNodes(this.editor, rebuilt);
    }

    /**
     * A user drew a connection while editing. Boundary connections teach the
     * definition (Blender semantics):
     * - placeholder drag: create a real interface socket bound to the member
     *   socket and replace the temporary connection with the real one;
     * - existing interface socket drag: (re)bind that socket to the member.
     * Member-to-member connections are untouched.
     */
    private async onBoundaryConnectionCreated(connection: {
        id: string;
        source: string;
        sourceOutput: string;
        target: string;
        targetInput: string;
    }): Promise<void> {
        if (this.suspendBoundarySync) return;
        const level = this.levels[this.levels.length - 1];
        if (level == null || this.groupInput == null || this.groupOutput == null) return;
        const definition = level.definition;

        if (connection.source === this.groupInput.id) {
            const member = this.editor.getNode(connection.target);
            if (member == null || member === this.groupOutput) return;
            if (connection.sourceOutput === GROUP_INPUT_PLACEHOLDER_KEY) {
                const socket = addGroupSocket(definition, "input", member.id, connection.targetInput);
                if (socket != null) {
                    this.groupInput.rebuildSockets();
                    this.syncBoundaryInstances(definition);
                    await this.host.updateNode?.(this.groupInput.id);
                }
                // Replace the temporary placeholder connection with the real
                // boundary connection (or drop it if that member input is
                // already exposed). Suspended so the sync above does not
                // reinterpret our own rewiring as another user drag.
                this.suspendBoundarySync = true;
                try {
                    await this.editor.removeConnection(connection.id);
                    if (socket != null) {
                        await this.connect(this.groupInput, socket.id, member, connection.targetInput);
                    }
                    this.notifyBoundaryChanged();
                } finally {
                    this.suspendBoundarySync = false;
                }
                return;
            }
            if (definition.inputs.some((entry) => entry.id === connection.sourceOutput)) {
                bindGroupSocket(definition, connection.sourceOutput, member.id, connection.targetInput, "input");
                await this.syncBoundaryInstances(definition);
                this.notifyBoundaryChanged();
            }
            return;
        }

        if (connection.target === this.groupOutput.id) {
            const member = this.editor.getNode(connection.source);
            if (member == null || member === this.groupInput) return;
            if (connection.targetInput === GROUP_OUTPUT_PLACEHOLDER_KEY) {
                const socket = addGroupSocket(definition, "output", member.id, connection.sourceOutput);
                if (socket != null) {
                    this.groupOutput.rebuildSockets();
                    this.syncBoundaryInstances(definition);
                    await this.host.updateNode?.(this.groupOutput.id);
                }
                this.suspendBoundarySync = true;
                try {
                    await this.editor.removeConnection(connection.id);
                    if (socket != null) {
                        await this.connect(member, connection.sourceOutput, this.groupOutput, socket.id);
                    }
                    this.notifyBoundaryChanged();
                } finally {
                    this.suspendBoundarySync = false;
                }
                return;
            }
            if (definition.outputs.some((entry) => entry.id === connection.targetInput)) {
                bindGroupSocket(definition, connection.targetInput, member.id, connection.sourceOutput, "output");
                await this.syncBoundaryInstances(definition);
                this.notifyBoundaryChanged();
            }
        }
    }

    /**
     * A user removed a connection while editing. If it was the wire feeding
     * a boundary socket's current binding, that socket becomes unbound (the
     * interface socket itself remains). The binding-match check matters when
     * a wire is dragged to a new member: the new connection rebinds first,
     * so removing the old wire must not unbind the new binding.
     */
    private onBoundaryConnectionRemoved(connection: {
        source: string;
        sourceOutput: string;
        target: string;
        targetInput: string;
    }): void {
        if (this.suspendBoundarySync) return;
        const level = this.levels[this.levels.length - 1];
        if (level == null || this.groupInput == null || this.groupOutput == null) return;
        const definition = level.definition;
        if (connection.source === this.groupInput.id) {
            const socket = definition.inputs.find((entry) => entry.id === connection.sourceOutput);
            if (socket != null && isGroupSocketBound(socket)
                && socket.nodeId === connection.target && socket.socketKey === connection.targetInput) {
                unbindGroupSocket(definition, socket.id, "input");
                this.syncBoundaryInstances(definition);
                this.notifyBoundaryChanged();
            }
            return;
        }
        if (connection.target === this.groupOutput.id) {
            const socket = definition.outputs.find((entry) => entry.id === connection.targetInput);
            if (socket != null && isGroupSocketBound(socket)
                && socket.nodeId === connection.source && socket.socketKey === connection.sourceOutput) {
                unbindGroupSocket(definition, socket.id, "output");
                this.syncBoundaryInstances(definition);
                this.notifyBoundaryChanged();
            }
        }
    }

    /** Add an arbitrary (unbound) boundary socket with a chosen label/type. */
    async addBoundarySocketAny(
        direction: "input" | "output",
        label: string,
        valueType = "unknown",
    ): Promise<boolean> {
        const level = this.levels[this.levels.length - 1];
        if (level == null) return false;
        createAnyGroupSocket(level.definition, direction, label, valueType);
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
                await this.host.updateNode?.(node.id);
            }
        }
        if (this.groupInput != null) {
            await this.host.updateNode?.(this.groupInput.id);
        }
        if (this.groupOutput != null) {
            await this.host.updateNode?.(this.groupOutput.id);
        }
        await this.rebuildBoundaryWiring();
        // Panel add/remove/retype changes the instance's sockets: prune
        // wires that referenced a removed socket (nested instance case),
        // so stale paths do not survive a refresh.
        await this.pruneStaleInstanceConnections(definition.id);
        await this.host.settleConnections?.();
        this.notifyBoundaryChanged();
    }

    /** Remove connections that reference a socket the instance no longer has.
     * After a boundary remove + setDefinition, editor connection records for
     * the removed socket would otherwise linger as stale/dangling wires. */
    private async pruneStaleInstanceConnections(definitionId?: string): Promise<void> {
        const stale: string[] = [];
        for (const node of this.editor.getNodes()) {
            if (!(node instanceof GroupNode)) continue;
            if (definitionId != null && node.definitionId !== definitionId) continue;
            for (const connection of this.editor.getConnections()) {
                if (connection.source === node.id && node.outputs[connection.sourceOutput] == null) {
                    stale.push(connection.id);
                } else if (connection.target === node.id && node.inputs[connection.targetInput] == null) {
                    stale.push(connection.id);
                }
            }
        }
        for (const id of [...new Set(stale)]) {
            await this.editor.removeConnection(id);
        }
    }

    /** Notify the host (e.g. App) so the open panel refreshes live.
     * Host callbacks are read-only state refreshes, so no loop. */
    private notifyBoundaryChanged(): void {
        this.host.onBoundaryChanged?.();
    }

    private async createBoundaryNodes(definition: GroupDefinition): Promise<void> {
        // Permanent definition-owned cards: reuse the definition's stable
        // ids and saved positions on every entry (Blender-style). Only
        // compute and persist a position the first time a card is shown.
        const record = ensureBoundaryNodes(definition);
        this.groupInput = new GroupInputNode(definition, record.inputId);
        this.groupOutput = new GroupOutputNode(definition, record.outputId);
        await this.editor.addNode(this.groupInput);
        await this.editor.addNode(this.groupOutput);
        const memberPositions = Object.values(definition.positions)
            .filter((position): position is Vec2 => position != null);
        const minX = memberPositions.length > 0 ? Math.min(...memberPositions.map((position) => position.x)) : 0;
        const minY = memberPositions.length > 0 ? Math.min(...memberPositions.map((position) => position.y)) : 0;
        const maxX = memberPositions.length > 0 ? Math.max(...memberPositions.map((position) => position.x)) : 640;
        if (record.inputPosition == null) {
            record.inputPosition = { x: Math.max(20, minX - 280), y: minY };
        }
        if (record.outputPosition == null) {
            record.outputPosition = { x: maxX + 40, y: minY };
        }
        await this.host.setPositions({
            ...definition.positions,
            [this.groupInput.id]: record.inputPosition,
            [this.groupOutput.id]: record.outputPosition,
        });
        await this.rebuildBoundaryWiring();
    }

    private async rebuildBoundaryWiring(): Promise<void> {
        if (this.groupInput == null || this.groupOutput == null) return;
        // Suspended: this restores exactly the saved boundary connections;
        // the sync must not read our own deletions as user unbinds.
        this.suspendBoundarySync = true;
        try {
            const boundaryIds = new Set([this.groupInput.id, this.groupOutput.id]);
            for (const connection of [...this.editor.getConnections()]) {
                if (boundaryIds.has(connection.source) || boundaryIds.has(connection.target)) {
                    await this.editor.removeConnection(connection.id);
                }
            }
            const definition = this.currentDefinition;
            if (definition == null) return;
            for (const socket of definition.inputs) {
                if (!isGroupSocketBound(socket)) continue;
                const member = this.editor.getNode(socket.nodeId);
                if (member != null && member.inputs[socket.socketKey] != null) {
                    await this.connect(this.groupInput, socket.id, member, socket.socketKey);
                }
            }
            for (const socket of definition.outputs) {
                if (!isGroupSocketBound(socket)) continue;
                const member = this.editor.getNode(socket.nodeId);
                if (member != null && member.outputs[socket.socketKey] != null) {
                    await this.connect(member, socket.socketKey, this.groupOutput, socket.id);
                }
            }
        } finally {
            this.suspendBoundarySync = false;
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
        // Persist where the user left the permanent Start/End cards so the
        // next entry (and a later save) restores exactly those positions.
        const boundaryRecord = ensureBoundaryNodes(level.definition);
        if (this.groupInput != null && positions[this.groupInput.id] != null) {
            boundaryRecord.inputPosition = positions[this.groupInput.id];
        }
        if (this.groupOutput != null && positions[this.groupOutput.id] != null) {
            boundaryRecord.outputPosition = positions[this.groupOutput.id];
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

        this.suspendBoundarySync = true;
        try {
            for (const connection of [...this.editor.getConnections()]) {
                await this.editor.removeConnection(connection.id);
            }
        } finally {
            this.suspendBoundarySync = false;
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
        // updateNode forces a repaint so added sockets appear immediately;
        // pruneStaleInstanceConnections drops wires for sockets removed in
        // the session (they were restored from the snapshot's copy).
        for (const node of this.editor.getNodes()) {
            if (node instanceof GroupNode && node.definitionId === level.definition.id) {
                node.setDefinition(level.definition);
                await this.host.updateNode?.(node.id);
            }
        }
        await this.pruneStaleInstanceConnections(level.definition.id);
        // Recreate the parent level's visible Start/End cards after a nested
        // group exit (they were omitted from the snapshot as transient UI).
        const parent = this.levels[this.levels.length - 1];
        if (parent != null) {
            await this.createBoundaryNodes(parent.definition);
            parent.boundaryInput = this.groupInput;
            parent.boundaryOutput = this.groupOutput;
        }
        await this.host.settleConnections?.();
        return true;
    }

    /**
     * Leave levels until `depth` remain (0 = top level). Used by the toolbar
     * breadcrumb, where an ancestor segment jumps straight to that group;
     * a depth at or beyond the current one is a no-op. Each level is exited
     * through `exit()` so snapshots, boundary positions and restored frames
     * follow exactly the same path as Tab.
     */
    async exitTo(depth: number): Promise<boolean> {
        const target = Math.max(0, Math.min(Math.trunc(depth), this.levels.length));
        let changed = false;
        while (this.levels.length > target) {
            await this.exit();
            changed = true;
        }
        return changed;
    }

    /**
     * Tab behaviour: when a GroupNode instance is selected, enter it (including
     * nested — entering a group instance inside an edited group pushes another
     * level); otherwise, inside a group, exit one level; otherwise noop.
     */
    async toggle(instanceId?: string): Promise<"entered" | "exited" | "noop"> {
        if (instanceId != null && (await this.enter(instanceId))) {
            return "entered";
        }
        if (this.levels.length > 0) {
            await this.exit();
            return "exited";
        }
        return "noop";
    }
}
