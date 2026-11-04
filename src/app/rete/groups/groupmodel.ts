/**
 * #14 grouping v2: Blender-style node groups (pure model, no DOM).
 *
 * A `GroupDefinition` owns a subgraph (its member nodes and the connections
 * between them) plus declared boundary sockets. A boundary input names a
 * member node's input socket — external values flow into it when the group
 * is inlined — and a boundary output names a member node's output socket.
 * Boundary sockets can be renamed, reordered, and given a default literal
 * (used when an instance's boundary input is left unconnected).
 *
 * A `GroupInstanceNode` (see ../nodes/groupinstancenode.ts) exposes exactly
 * the boundary sockets and may be placed any number of times. Member nodes
 * can themselves be group instances, so groups nest; `findGroupCycle`
 * rejects a definition graph that contains a cycle (A uses B, B uses A),
 * because inlining such a group would never terminate.
 */
import type { OnshapeNode } from "../nodes/onshapenode";
import type { SerializedConnection, Vec2 } from "../serialization/graph-schema-types";

export interface GroupSocketDefinition {
    /** Stable id, also the instance node's socket key: `${nodeId}.${socketKey}`. */
    id: string;
    /** Display label on the instance node; defaults to the member socket key. */
    label: string;
    direction: "input" | "output";
    /** Id of the member node this socket is bound to. */
    nodeId: string;
    /** Socket key on that member node. */
    socketKey: string;
    /** FeatureScript value type label, for the instance socket's type. */
    valueType?: string;
    /** Literal emitted when an instance leaves this input unconnected. */
    defaultLiteral?: string;
}

export interface GroupDefinition {
    id: string;
    name: string;
    /** Member nodes. Not in the editor except while this group is being edited. */
    nodes: OnshapeNode[];
    /** Connections *between* member nodes only. */
    connections: SerializedConnection[];
    inputs: GroupSocketDefinition[];
    outputs: GroupSocketDefinition[];
    /** Canvas positions of member nodes while editing, by node id. */
    positions: Record<string, Vec2 | null>;
}

export function createGroupDefinition(id: string, name: string): GroupDefinition {
    return { id, name, nodes: [], connections: [], inputs: [], outputs: [], positions: {} };
}

export function groupSocketId(nodeId: string, socketKey: string): string {
    return `${nodeId}.${socketKey}`;
}

/**
 * Derive boundary sockets from a member set: every connection from outside
 * the set into a member is a boundary input (one per target socket), every
 * connection from a member to outside is a boundary output. Repeated
 * connections to the same socket share one boundary socket.
 */
export function extractBoundarySockets(
    memberIds: ReadonlySet<string>,
    connections: readonly SerializedConnection[],
    valueTypeOf?: (nodeId: string, socketKey: string, direction: "input" | "output") => string | undefined,
): { inputs: GroupSocketDefinition[]; outputs: GroupSocketDefinition[] } {
    const inputs = new Map<string, GroupSocketDefinition>();
    const outputs = new Map<string, GroupSocketDefinition>();
    for (const connection of connections) {
        const sourceInside = memberIds.has(connection.source);
        const targetInside = memberIds.has(connection.target);
        if (!sourceInside && targetInside) {
            const id = groupSocketId(connection.target, connection.targetInput);
            if (!inputs.has(id)) {
                inputs.set(id, {
                    id,
                    label: connection.targetInput,
                    direction: "input",
                    nodeId: connection.target,
                    socketKey: connection.targetInput,
                    valueType: valueTypeOf?.(connection.target, connection.targetInput, "input"),
                });
            }
        } else if (sourceInside && !targetInside) {
            const id = groupSocketId(connection.source, connection.sourceOutput);
            if (!outputs.has(id)) {
                outputs.set(id, {
                    id,
                    label: connection.sourceOutput,
                    direction: "output",
                    nodeId: connection.source,
                    socketKey: connection.sourceOutput,
                    valueType: valueTypeOf?.(connection.source, connection.sourceOutput, "output"),
                });
            }
        }
    }
    return { inputs: [...inputs.values()], outputs: [...outputs.values()] };
}

/** Rename a boundary socket's display label. Returns false for an unknown id. */
export function renameGroupSocket(definition: GroupDefinition, socketId: string, label: string): boolean {
    const socket = [...definition.inputs, ...definition.outputs].find((entry) => entry.id === socketId);
    if (socket == null || label.trim() === "") {
        return false;
    }
    socket.label = label.trim();
    return true;
}

/**
 * Reorder one side's boundary sockets (instance socket order follows the
 * definition arrays). Ids not listed keep their relative order at the end;
 * unknown ids are ignored.
 */
export function reorderGroupSockets(
    definition: GroupDefinition,
    direction: "input" | "output",
    orderedSocketIds: readonly string[],
): void {
    const list = direction === "input" ? definition.inputs : definition.outputs;
    const byId = new Map(list.map((socket) => [socket.id, socket]));
    const reordered = orderedSocketIds
        .map((id) => byId.get(id))
        .filter((socket): socket is GroupSocketDefinition => socket != null);
    for (const socket of list) {
        if (!orderedSocketIds.includes(socket.id)) {
            reordered.push(socket);
        }
    }
    if (direction === "input") {
        definition.inputs = reordered;
    } else {
        definition.outputs = reordered;
    }
}

/** Set (or clear, with `undefined`) a boundary input's default literal. */
export function setGroupSocketDefault(
    definition: GroupDefinition,
    socketId: string,
    defaultLiteral: string | undefined,
): boolean {
    const socket = definition.inputs.find((entry) => entry.id === socketId);
    if (socket == null) {
        return false;
    }
    if (defaultLiteral == null) {
        delete socket.defaultLiteral;
    } else {
        socket.defaultLiteral = defaultLiteral;
    }
    return true;
}

/** Ids of the group definitions a definition directly contains (its nested instances). */
export function nestedDefinitionIds(definition: GroupDefinition): string[] {
    const ids: string[] = [];
    for (const node of definition.nodes) {
        const definitionId = (node as { definitionId?: unknown }).definitionId;
        if (typeof definitionId === "string" && !ids.includes(definitionId)) {
            ids.push(definitionId);
        }
    }
    return ids;
}

/**
 * Find a cycle in the definition graph starting from `startId` (A uses B,
 * B uses A, ...). Returns the cycle as a list of definition ids, or null.
 * Unknown ids are leaves (a dangling reference is a separate error).
 */
export function findGroupCycle(
    definitions: ReadonlyMap<string, GroupDefinition>,
    startId: string,
): string[] | null {
    const visit = (id: string, trail: string[]): string[] | null => {
        if (trail.includes(id)) {
            return [...trail.slice(trail.indexOf(id)), id];
        }
        const definition = definitions.get(id);
        if (definition == null) {
            return null;
        }
        for (const nestedId of nestedDefinitionIds(definition)) {
            const cycle = visit(nestedId, [...trail, id]);
            if (cycle != null) {
                return cycle;
            }
        }
        return null;
    };
    return visit(startId, []);
}

/**
 * Whether placing definition `innerId` inside definition `containingId`
 * would create a cycle — i.e. `innerId` already (transitively) contains
 * `containingId`, or they are the same definition.
 */
export function wouldCreateGroupCycle(
    definitions: ReadonlyMap<string, GroupDefinition>,
    containingId: string,
    innerId: string,
): boolean {
    if (containingId === innerId) {
        return true;
    }
    const candidate = new Map(definitions);
    const containing = candidate.get(containingId);
    if (containing != null && !nestedDefinitionIds(containing).includes(innerId)) {
        candidate.set(containingId, {
            ...containing,
            nodes: [
                ...containing.nodes,
                { definitionId: innerId } as unknown as OnshapeNode,
            ],
        });
    }
    return findGroupCycle(candidate, innerId) != null;
}

/** Validate one definition: boundary sockets bind real member sockets, no cycle. */
export function validateGroupDefinition(
    definition: GroupDefinition,
    definitions: ReadonlyMap<string, GroupDefinition>,
): string | null {
    const memberIds = new Set(definition.nodes.map((node) => node.id));
    for (const socket of [...definition.inputs, ...definition.outputs]) {
        const member = definition.nodes.find((node) => node.id === socket.nodeId);
        if (member == null || !memberIds.has(socket.nodeId)) {
            return `Group "${definition.id}" boundary socket "${socket.id}" references missing member node "${socket.nodeId}".`;
        }
        const side = socket.direction === "input" ? member.inputs : member.outputs;
        if (side?.[socket.socketKey] == null) {
            return `Group "${definition.id}" boundary socket "${socket.id}" references missing ${socket.direction} "${socket.socketKey}" on node "${socket.nodeId}".`;
        }
    }
    for (const connection of definition.connections) {
        if (!memberIds.has(connection.source) || !memberIds.has(connection.target)) {
            return `Group "${definition.id}" has a connection referencing a non-member node (${connection.source} -> ${connection.target}).`;
        }
    }
    const cycle = findGroupCycle(definitions, definition.id);
    if (cycle != null) {
        return `Group definitions form a cycle: ${cycle.join(" -> ")}.`;
    }
    return null;
}
