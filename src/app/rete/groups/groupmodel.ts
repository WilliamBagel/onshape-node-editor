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

/** A member socket that can still become a group boundary socket. */
export interface GroupSocketCandidate {
    direction: "input" | "output";
    nodeId: string;
    nodeTitle: string;
    socketKey: string;
    label: string;
    valueType?: string;
}

/** Editable fields of an existing boundary socket. */
export interface GroupSocketPatch {
    label?: string;
    valueType?: string;
}


/** Stable identity and placement of a group's Start/End Feature cards. */
export interface GroupBoundaryNodes {
    inputId: string;
    outputId: string;
    inputPosition: Vec2 | null;
    outputPosition: Vec2 | null;
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
    /**
     * Permanent Start/End Feature boundary identity. The boundary cards
     * are definition-owned, not ordinary graph nodes: they are recreated
     * on every group entry with these stable ids and positions, and
     * serialized inside this definition (never as top-level nodes).
     * `inputs`/`outputs` remain the single source of truth for sockets.
     */
    boundaryNodes: GroupBoundaryNodes;
}

/** Stable boundary ids derived from the definition id (unique per definition). */
export function defaultBoundaryNodes(definitionId: string): GroupBoundaryNodes {
    return {
        inputId: `${definitionId}:boundary-input`,
        outputId: `${definitionId}:boundary-output`,
        inputPosition: null,
        outputPosition: null,
    };
}

/** Fill in a missing boundary record (legacy/manual definitions). */
export function ensureBoundaryNodes(definition: GroupDefinition): GroupBoundaryNodes {
    const existing = definition.boundaryNodes;
    if (existing == null || existing.inputId == null || existing.inputId === "" || existing.outputId == null || existing.outputId === "") {
        definition.boundaryNodes = {
            ...(existing ?? {}),
            ...defaultBoundaryNodes(definition.id),
            inputPosition: existing?.inputPosition ?? null,
            outputPosition: existing?.outputPosition ?? null,
        } as GroupBoundaryNodes;
    }
    return definition.boundaryNodes;
}

export function createGroupDefinition(id: string, name: string): GroupDefinition {
    return { id, name, nodes: [], connections: [], inputs: [], outputs: [], positions: {}, boundaryNodes: defaultBoundaryNodes(id) };
}

export function groupSocketId(nodeId: string, socketKey: string): string {
    return `${nodeId}.${socketKey}`;
}

function memberSocketValueType(node: OnshapeNode, socketKey: string, direction: "input" | "output"): string | undefined {
    const side = direction === "input" ? node.inputs : node.outputs;
    return (side?.[socketKey]?.socket as { valueType?: { name: string } } | undefined)?.valueType?.name;
}

/**
 * Member sockets that are not yet exposed as boundary sockets. The group
 * editor's input/output menu uses this to offer only real, bindable targets.
 */
export function listGroupSocketCandidates(definition: GroupDefinition): {
    inputs: GroupSocketCandidate[];
    outputs: GroupSocketCandidate[];
} {
    const boundInputs = new Set(definition.inputs.map((socket) => socket.id));
    const boundOutputs = new Set(definition.outputs.map((socket) => socket.id));
    const inputs: GroupSocketCandidate[] = [];
    const outputs: GroupSocketCandidate[] = [];
    for (const node of definition.nodes) {
        for (const [socketKey, input] of Object.entries(node.inputs)) {
            const id = groupSocketId(node.id, socketKey);
            if (boundInputs.has(id)) continue;
            const socket = input.socket as { name?: string; valueType?: { name: string } };
            inputs.push({
                direction: "input",
                nodeId: node.id,
                nodeTitle: node.getTitle(),
                socketKey,
                label: input.label ?? socket.name ?? socketKey,
                valueType: socket.valueType?.name,
            });
        }
        for (const [socketKey, output] of Object.entries(node.outputs)) {
            const id = groupSocketId(node.id, socketKey);
            if (boundOutputs.has(id)) continue;
            const socket = output.socket as { name?: string; valueType?: { name: string } };
            outputs.push({
                direction: "output",
                nodeId: node.id,
                nodeTitle: node.getTitle(),
                socketKey,
                label: output.label ?? socket.name ?? socketKey,
                valueType: socket.valueType?.name,
            });
        }
    }
    return { inputs, outputs };
}

/**
 * Expose one member socket as a boundary socket. The binding is by member
 * node id + socket key, so it survives reordering and display renames.
 */
export function addGroupSocket(
    definition: GroupDefinition,
    direction: "input" | "output",
    nodeId: string,
    socketKey: string,
    label?: string,
    valueType?: string,
): GroupSocketDefinition | null {
    const node = definition.nodes.find((member) => member.id === nodeId);
    if (node == null) return null;
    const side = direction === "input" ? node.inputs : node.outputs;
    const socket = side?.[socketKey];
    if (socket == null) return null;
    const id = groupSocketId(nodeId, socketKey);
    const list = direction === "input" ? definition.inputs : definition.outputs;
    if (list.some((entry) => entry.id === id)) return null;
    const candidate = listGroupSocketCandidates(definition)[direction === "input" ? "inputs" : "outputs"]
        .find((entry) => entry.nodeId === nodeId && entry.socketKey === socketKey);
    const result: GroupSocketDefinition = {
        id,
        label: (label ?? candidate?.label ?? socketKey).trim() || socketKey,
        direction,
        nodeId,
        socketKey,
        valueType: valueType ?? memberSocketValueType(node, socketKey, direction),
    };
    list.push(result);
    return result;
}

/** Rename and/or retype an existing boundary socket. */
export function updateGroupSocket(
    definition: GroupDefinition,
    socketId: string,
    patch: GroupSocketPatch,
    direction?: "input" | "output",
): boolean {
    const list = direction == null
        ? [...definition.inputs, ...definition.outputs]
        : direction === "input" ? definition.inputs : definition.outputs;
    const socket = list.find((entry) => entry.id === socketId);
    if (socket == null) return false;
    if (patch.label != null) {
        const label = patch.label.trim();
        if (label === "") return false;
        socket.label = label;
    }
    if (patch.valueType != null) {
        socket.valueType = patch.valueType;
    }
    return true;
}

/** Remove a boundary socket. Member wiring is untouched. */
export function removeGroupSocket(
    definition: GroupDefinition,
    socketId: string,
    direction?: "input" | "output",
): boolean {
    const resolved = direction ?? (definition.inputs.some((entry) => entry.id === socketId)
        ? "input"
        : definition.outputs.some((entry) => entry.id === socketId)
            ? "output"
            : null);
    if (resolved == null) return false;
    if (resolved === "input") {
        definition.inputs = definition.inputs.filter((entry) => entry.id !== socketId);
    } else {
        definition.outputs = definition.outputs.filter((entry) => entry.id !== socketId);
    }
    return true;
}

/**
 * The frame a group instance should inherit: the one shared parent frame of
 * every selected member, or null when the selection is not wholly inside one
 * frame. Grouping must not orphan a frame's contents (an empty frame collapses
 * to its header and the user loses the visual grouping).
 */
export function commonGroupParent(nodes: readonly { group: string | null }[]): string | null {
    if (nodes.length === 0) return null;
    const parent = nodes[0].group;
    if (parent == null) return null;
    return nodes.every((node) => node.group === parent) ? parent : null;
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

/** Node kinds that can be cloned into a group definition (#47). */
const GROUPABLE_KINDS: ReadonlySet<string> = new Set([
    "function",
    "CustomFeature",
    "utility-statement",
    "math-expression",
    "group-instance",
    "array-literal",
    "array-concat",
    "array-index",
    "array-size",
    "map-array",
    "for-each",
    "bounded-for",
]);

/** Whether a node kind can be a member of a group (see cloneMember). */
export function isGroupableKind(type: string): boolean {
    return GROUPABLE_KINDS.has(type);
}

/**
 * Throw naming the first selection member whose kind cannot be grouped
 * (CustomFeature / define-feature / output-feature / frame / unknown).
 * Used at group creation so the user learns upfront, not at Run.
 */
export function assertGroupableSelection(nodes: readonly OnshapeNode[]): void {
    for (const node of nodes) {
        if (!isGroupableKind(node.type)) {
            throw new Error(
                `Cannot group node "${node.getTitle()}" of kind "${node.type}": this node kind cannot be a group member.`,
            );
        }
    }
}

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
