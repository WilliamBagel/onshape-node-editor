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
import { Connection } from "../types";
import { StyleSettings } from "../stylesettings";
import { connectGraphNodes } from "../serialization/graph-serializer";
import type { GroupDefinition } from "./groupmodel";
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
}

export class GroupEditorController {
    private readonly levels: EditLevel[] = [];

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
        this.levels.push({ instanceId, definition, snapshot });

        // Connections first: `removeNode` alone leaves them behind.
        for (const connection of [...this.editor.getConnections()]) {
            await this.editor.removeConnection(connection.id);
        }
        for (const current of [...this.editor.getNodes()]) {
            await this.editor.removeNode(current.id);
        }
        for (const member of definition.nodes) {
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
        return true;
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
