/**
 * Graph serializer for schema version 2.
 *
 * `serializeGraph` reads a rete `NodeEditor`, a placement map and the canvas's
 * node order, and produces a plain JSON document. `deserializeGraph` validates
 * the document, refuses anything it does not understand, and rebuilds
 * nodes/connections without touching the DOM. `applyGraph` puts the rebuilt
 * graph into an editor the same way the app does (nodes first, then
 * connections, then the connection side effects that `editorbase` installs as a
 * pipe); applying `graph.nodeOrder` to the canvas is the caller's job, because
 * the area plugin owns the DOM.
 *
 * See `docs/graph-schema.md` for the document contract.
 */
import type { NodeEditor } from "rete";
import { OnshapeNode } from "../nodes/onshapenode";
import { FrameNode } from "../nodes/framenode";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
import { DefineFeatureNode } from "../nodes/definefeaturenode";
import { OutputFeatureNode } from "../nodes/outputfeaturenode";
import { FunctionNode } from "../nodes/functionnode";
import { GroupNode } from "../nodes/groupinstancenode";
import { createGroupDefinition, ensureBoundaryNodes, validateGroupDefinition, type GroupDefinition } from "../groups/groupmodel";
import { UtilityStatementNode } from "../nodes/utilitystatementnode";
import { MathExpressionNode } from "../nodes/mathexpressionnode";
import { resolveUtilityStatement, utilityMeta } from "../catalog-node-factory";
import { defaultCatalog } from "../../onshape/catalog/spec-catalog";
import type { CatalogEntry } from "../../onshape/catalog/types";
import { UTILITY_BY_ID } from "../../onshape/catalog/utility-overrides";
import {
    ArrayConcatNode,
    ArrayIndexNode,
    ArrayLiteralNode,
    ArraySizeNode,
    BoundedForNode,
    ForEachNode,
    MapArrayNode,
} from "../nodes/arraynodes";
import { Connection, Schemes } from "../types";
import { StyleSettings } from "../stylesettings";
import { getConnectionIO } from "../utils";
import { NodeOrder, reconcileOrder } from "../modified-rete/nodeorder";
import {
    GRAPH_SCHEMA_VERSION,
    LOADABLE_SCHEMA_VERSIONS,
    SerializedConnection,
    SerializedFrame,
    SerializedGraph,
    SerializedGroupDefinition,
    SerializedNode,
    SerializedNodeBase,
    SerializedNodeKind,
    SpecResolver,
    Vec2,
    FeatureSpecReference,
} from "./graph-schema-types";

export interface LoadedGraph {
    /** Every node, frames first (the scopes plugin needs parents added before children). */
    nodes: OnshapeNode[];
    connections: Connection<OnshapeNode, OnshapeNode>[];
    /** Node id -> canvas position, for `area.translate` on load. */
    positions: Record<string, Vec2 | null>;
    /**
     * Paint order, bottom-most first, ready for `NodeOrderKeeper.setOrder`.
     * Derived from the `nodes` array for a version-1 document.
     */
    nodeOrder: NodeOrder;
    /** Group definitions (#14), stored once; instances reference them by id. */
    groupDefinitions: GroupDefinition[];
    /** Non-fatal things the load had to do (migration, repaired order). */
    warnings: string[];
}

export type LoadGraphResult =
    | { ok: true; graph: LoadedGraph }
    | { ok: false; error: string };

export interface DeserializeOptions {
    /** Resolves a stored spec reference to a spec body. Required for graphs with CustomFeature nodes. */
    resolveSpec: SpecResolver;
    styleSettings?: StyleSettings;
    /**
     * Resolves a catalog function name to its catalog entry, so legacy
     * FunctionNode documents without persisted `outputs` recover their
     * output value types. Defaults to a lookup in the shipped catalog
     * (`defaultCatalog`), which is what the app loads.
     */
    resolveCatalogEntry?: (functionName: string) => CatalogEntry | undefined;
}

/** Default catalog lookup by bare function name (first nodeable value entry). */
function defaultCatalogEntry(functionName: string): CatalogEntry | undefined {
    return defaultCatalog.entries.find(
        (entry) => entry.name === functionName && entry.kind === "value" && entry.nodeable,
    );
}

const SUPPORTED_KINDS: SerializedNodeKind[] = [
    "CustomFeature",
    "define-feature",
    "output-feature",
    "function",
    "utility-statement",
    "array-literal",
    "array-concat",
    "array-index",
    "array-size",
    "map-array",
    "for-each",
    "bounded-for",
    "math-expression",
    "group-instance",
];

/**
 * Serialize every node and connection in `editor`.
 *
 * @param positions canvas positions keyed by node id (the rete area plugin owns
 *                  them, so they cannot be read off the node). Missing entries
 *                  are written as `null`.
 * @param nodeOrder the canvas's paint order, bottom-most first — normally
 *                  `nodeOrderKeeper.getOrder()`. Ids that no longer exist are
 *                  dropped and nodes the list does not mention are appended in
 *                  creation order, so the document always names every node
 *                  exactly once. Omitting it stores creation order.
 */
export function serializeGraph(
    editor: NodeEditor<Schemes>,
    positions: Record<string, Vec2 | null> = {},
    nodeOrder: readonly string[] = []
): SerializedGraph {
    // #13: frames serialize apart from codegen nodes — "frame" is not in
    // SUPPORTED_KINDS and must not hit the unknown-kind refusal below. They
    // also stay out of `nodeOrder`: the canvas pins frame elements behind
    // their children instead of stacking them with the nodes.
    const frames: SerializedFrame[] = [];
    const transientIds = new Set(
        editor.getNodes().filter((node) => node.transient).map((node) => node.id),
    );
    const nodes = editor.getNodes().filter((node) => {
        if (node instanceof FrameNode) {
            frames.push({
                ...node.toFrameJSON(),
                position: positions[node.id] ?? null,
            });
            return false;
        }
        // Group Start/End cards are definition-owned permanent cards, never
        // top-level nodes: their identity/positions are serialized inside
        // the group definition (see collectDefinition below), so snapshots
        // and saved graphs carry them there, not in `nodes`.
        return !node.transient;
    }).map((node) => {
        const serialized = node.toJSON() as SerializedNode;
        if (!SUPPORTED_KINDS.includes(serialized.kind)) {
            throw new Error(
                `Cannot serialize node "${node.id}" of kind "${serialized.kind}": ` +
                `schema version ${GRAPH_SCHEMA_VERSION} supports ${SUPPORTED_KINDS.join(", ")}.`
            );
        }
        return {
            ...serialized,
            position: positions[node.id] ?? null,
        } as SerializedNode;
    });

    const connections: SerializedConnection[] = editor.getConnections()
        .filter((connection) => !transientIds.has(connection.source) && !transientIds.has(connection.target))
        .map((connection) => ({
            source: connection.source,
            sourceOutput: connection.sourceOutput,
            target: connection.target,
            targetInput: connection.targetInput,
        }));

    // #14: definitions are stored once per graph, collected from every
    // instance in the editor (recursively, for nested instances). Member
    // nodes are not in the editor, so they never appear in `nodes` above.
    const groupDefinitions: SerializedGroupDefinition[] = [];
    const seenDefinitions = new Set<string>();
    const collectDefinition = (definition: GroupDefinition): void => {
        if (seenDefinitions.has(definition.id)) {
            return;
        }
        seenDefinitions.add(definition.id);
        for (const member of definition.nodes) {
            if (member instanceof GroupNode) {
                collectDefinition(member.getDefinition());
            }
        }
        const boundary = ensureBoundaryNodes(definition);
        groupDefinitions.push({
            id: definition.id,
            name: definition.name,
            nodes: definition.nodes.map((member) => ({
                ...(member.toJSON() as SerializedNode),
                position: definition.positions[member.id] ?? null,
            }) as SerializedNode),
            connections: definition.connections.map((connection) => ({ ...connection })),
            inputs: definition.inputs.map((socket) => ({ ...socket })),
            outputs: definition.outputs.map((socket) => ({ ...socket })),
            boundaryNodes: { ...boundary },
        });
    };
    for (const node of editor.getNodes()) {
        if (node instanceof GroupNode) {
            collectDefinition(node.getDefinition());
        }
    }

    return {
        schemaVersion: GRAPH_SCHEMA_VERSION,
        nodes,
        connections,
        nodeOrder: reconcileOrder(nodeOrder, nodes.map((node) => node.id)),
        // Omitted when empty so pre-#13 documents keep their exact shape.
        ...(frames.length > 0 ? { frames } : {}),
        ...(groupDefinitions.length > 0 ? { groupDefinitions } : {}),
    };
}

/**
 * Rebuild one node from its serialized form (shared by the top-level graph
 * and group definition members). Throws with a load-facing message.
 */
function buildNode(
    serialized: SerializedNode,
    options: DeserializeOptions,
    definitions: ReadonlyMap<string, GroupDefinition>,
): OnshapeNode {
    switch (serialized.kind) {
        case "CustomFeature":
            return CustomFeatureNode.fromJSON(serialized, options.resolveSpec);
        case "define-feature":
            return DefineFeatureNode.fromJSON(serialized);
        case "output-feature":
            return OutputFeatureNode.fromJSON(serialized);
        case "function":
            return FunctionNode.fromJSON(serialized, options.resolveCatalogEntry ?? defaultCatalogEntry, (utilityId) => {
                const override = UTILITY_BY_ID[utilityId];
                return override != null ? utilityMeta(override) : undefined;
            });
        case "math-expression":
            return MathExpressionNode.fromJSON(serialized);
        case "utility-statement":
            return UtilityStatementNode.fromJSON(serialized, resolveUtilityStatement);
        case "array-literal":
            return ArrayLiteralNode.fromJSON(serialized);
        case "array-concat":
            return ArrayConcatNode.fromJSON(serialized);
        case "array-index":
            return ArrayIndexNode.fromJSON(serialized);
        case "array-size":
            return ArraySizeNode.fromJSON(serialized);
        case "map-array":
            return MapArrayNode.fromJSON(serialized);
        case "for-each":
            return ForEachNode.fromJSON(serialized);
        case "bounded-for":
            return BoundedForNode.fromJSON(serialized);
        case "group-instance": {
            const definition = definitions.get(serialized.definitionId);
            if (definition == null) {
                throw new Error(
                    `group instance "${serialized.id}" references missing group definition "${serialized.definitionId}".`
                );
            }
            return GroupNode.fromJSON(serialized, definition);
        }
        default:
            throw new Error(`unknown kind "${(serialized as SerializedNodeBase).kind}".`);
    }
}

/**
 * Validate and rebuild a serialized graph.
 *
 * Never throws and never fails silently: an unknown `schemaVersion`, an
 * unknown node kind, a dangling connection or an unresolvable spec reference all
 * come back as `{ ok: false, error }` with a message naming the problem.
 *
 * Version 1 is accepted and migrated in the open: it has no `nodeOrder`, so the
 * paint order is derived from the `nodes` array (creation order) and the load
 * says so in `graph.warnings`. Version 2 is the only version written.
 */
export function deserializeGraph(raw: unknown, options: DeserializeOptions): LoadGraphResult {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "Graph could not be loaded: the document is not a JSON object." };
    }

    const document = raw as Partial<SerializedGraph>;

    const version = (raw as { schemaVersion?: unknown }).schemaVersion;
    if (typeof version !== "number" || !Number.isInteger(version) || !LOADABLE_SCHEMA_VERSIONS.includes(version)) {
        return {
            ok: false,
            error:
                `Unsupported graph schemaVersion: ${version === undefined ? "(missing)" : JSON.stringify(version)}. ` +
                `This build supports schemaVersion ${GRAPH_SCHEMA_VERSION} (and reads version 1); refusing to load the graph.`,
        };
    }

    const styleSettings = options.styleSettings ?? new StyleSettings();
    const warnings: string[] = [];
    const nodes: OnshapeNode[] = [];
    const byId = new Map<string, OnshapeNode>();
    const positions: Record<string, Vec2 | null> = {};

    if (!Array.isArray(document.nodes)) {
        return { ok: false, error: "Graph could not be loaded: \"nodes\" must be an array." };
    }

    // #13: rebuild frames first — a child's `group` (the scopes plugin's
    // `parent`) points at a frame id, and the plugin refuses a node whose
    // parent does not exist yet. Frame ids also bound `group` validation:
    // a dangling group is repaired to null with a warning, like `nodeOrder`.
    const frameIds = new Set<string>();
    if (document.frames !== undefined) {
        if (!Array.isArray(document.frames)) {
            return { ok: false, error: "Graph could not be loaded: \"frames\" must be an array." };
        }
        for (const [index, serialized] of document.frames.entries()) {
            if (serialized == null || typeof serialized !== "object" || typeof serialized.id !== "string") {
                return { ok: false, error: `Graph could not be loaded: frame ${index} is malformed.` };
            }
            const frame = FrameNode.fromJSON(serialized as SerializedFrame);
            if (byId.has(frame.id)) {
                return { ok: false, error: `Graph could not be loaded: duplicate node id "${frame.id}".` };
            }
            nodes.push(frame);
            byId.set(frame.id, frame);
            frameIds.add(frame.id);
            positions[frame.id] = serialized.position ?? null;
        }
        // A frame's own group must name another frame in the document.
        for (const frame of nodes) {
            if (frame instanceof FrameNode && frame.group != null && !frameIds.has(frame.group)) {
                warnings.push(
                    `Frame "${frame.id}" referenced missing parent frame "${frame.group}"; the frame was loaded unnested.`
                );
                frame.group = null;
            }
        }
    }

    // #14: rebuild group definitions first (shells, then members), so an
    // instance node — top-level or nested in another definition — can
    // reference its definition by id. Member nodes live in the definition,
    // not in the editor's top-level node list.
    const groupDefinitions: GroupDefinition[] = [];
    const groupDefinitionMap = new Map<string, GroupDefinition>();
    if (document.groupDefinitions !== undefined) {
        if (!Array.isArray(document.groupDefinitions)) {
            return { ok: false, error: "Graph could not be loaded: \"groupDefinitions\" must be an array." };
        }
        for (const serialized of document.groupDefinitions) {
            if (serialized == null || typeof serialized !== "object" || typeof serialized.id !== "string" || serialized.id === "") {
                return { ok: false, error: "Graph could not be loaded: a group definition is malformed." };
            }
            if (groupDefinitionMap.has(serialized.id)) {
                return { ok: false, error: `Graph could not be loaded: duplicate group definition id "${serialized.id}".` };
            }
            const definition = createGroupDefinition(serialized.id, typeof serialized.name === "string" ? serialized.name : serialized.id);
            definition.inputs = (serialized.inputs ?? []).map((socket) => ({ ...socket }));
            definition.outputs = (serialized.outputs ?? []).map((socket) => ({ ...socket }));
            definition.connections = (serialized.connections ?? []).map((connection) => ({ ...connection }));
            if (serialized.boundaryNodes != null && typeof serialized.boundaryNodes === "object") {
                ensureBoundaryNodes(definition);
                if (typeof serialized.boundaryNodes.inputId === "string" && serialized.boundaryNodes.inputId !== "") {
                    definition.boundaryNodes.inputId = serialized.boundaryNodes.inputId;
                }
                if (typeof serialized.boundaryNodes.outputId === "string" && serialized.boundaryNodes.outputId !== "") {
                    definition.boundaryNodes.outputId = serialized.boundaryNodes.outputId;
                }
                definition.boundaryNodes.inputPosition = serialized.boundaryNodes.inputPosition ?? null;
                definition.boundaryNodes.outputPosition = serialized.boundaryNodes.outputPosition ?? null;
            }
            groupDefinitions.push(definition);
            groupDefinitionMap.set(serialized.id, definition);
        }
        for (const serialized of document.groupDefinitions) {
            const definition = groupDefinitionMap.get(serialized.id) as GroupDefinition;
            for (const [memberIndex, member] of (serialized.nodes ?? []).entries()) {
                const problem = validateNodeBase(member, memberIndex);
                if (problem != null) {
                    return { ok: false, error: `Group definition "${serialized.id}": ${problem}` };
                }
                let memberNode: OnshapeNode;
                try {
                    memberNode = buildNode(member, options, groupDefinitionMap);
                } catch (error) {
                    return {
                        ok: false,
                        error: `Graph could not be loaded: group definition "${serialized.id}": ${error instanceof Error ? error.message : String(error)}`,
                    };
                }
                if (definition.nodes.some((existing) => existing.id === memberNode.id)) {
                    return { ok: false, error: `Graph could not be loaded: group definition "${serialized.id}" has duplicate member id "${memberNode.id}".` };
                }
                definition.nodes.push(memberNode);
                definition.positions[memberNode.id] = member.position ?? null;
            }
            const invalid = validateGroupDefinition(definition, groupDefinitionMap);
            if (invalid != null) {
                return { ok: false, error: `Graph could not be loaded: ${invalid}` };
            }
        }
    }

    for (const [index, serialized] of document.nodes.entries()) {
        const problem = validateNodeBase(serialized, index);
        if (problem != null) {
            return { ok: false, error: problem };
        }

        let node: OnshapeNode;
        try {
            node = buildNode(serialized, options, groupDefinitionMap);
        } catch (error) {
            return {
                ok: false,
                error: `Graph could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
            };
        }

        if (byId.has(node.id)) {
            return { ok: false, error: `Graph could not be loaded: duplicate node id "${node.id}".` };
        }

        nodes.push(node);
        byId.set(node.id, node);
        positions[node.id] = serialized.position ?? null;

        // A grouped node whose frame is missing from the document loads
        // ungrouped (the scopes plugin would otherwise refuse it), with a
        // warning naming the dangling reference.
        if (node.group != null && !frameIds.has(node.group)) {
            warnings.push(
                `Node "${node.id}" referenced missing frame "${node.group}"; the node was loaded ungrouped.`
            );
            node.group = null;
        }
    }

    const orderIds = nodes.filter((node) => !(node instanceof FrameNode)).map((node) => node.id);
    const orderResult = readNodeOrder(document, version, orderIds, warnings);
    if (orderResult.ok === false) {
        return { ok: false, error: orderResult.error };
    }

    const connections: Connection<OnshapeNode, OnshapeNode>[] = [];
    const rawConnections = document.connections ?? [];
    if (!Array.isArray(rawConnections)) {
        return { ok: false, error: "Graph could not be loaded: \"connections\" must be an array." };
    }

    for (const [index, serialized] of rawConnections.entries()) {
        if (serialized == null || typeof serialized !== "object") {
            return { ok: false, error: `Graph could not be loaded: connection ${index} is not an object.` };
        }
        const { source, sourceOutput, target, targetInput } = serialized;
        if (!source || !target || !sourceOutput || !targetInput) {
            return {
                ok: false,
                error: `Graph could not be loaded: connection ${index} is missing source, sourceOutput, target or targetInput.`,
            };
        }

        const sourceNode = byId.get(source);
        const targetNode = byId.get(target);
        if (sourceNode == null || targetNode == null) {
            return {
                ok: false,
                error: `Graph could not be loaded: connection ${index} references missing node (${sourceNode == null ? source : target}).`,
            };
        }
        if (sourceNode.outputs[sourceOutput] == null) {
            return {
                ok: false,
                error: `Graph could not be loaded: node "${source}" has no output "${sourceOutput}".`,
            };
        }
        if (targetNode.inputs[targetInput] == null) {
            return {
                ok: false,
                error: `Graph could not be loaded: node "${target}" has no input "${targetInput}".`,
            };
        }

        connections.push(
            new Connection(
                sourceNode,
                sourceOutput,
                sourceNode.outputs[sourceOutput].socket.name,
                targetNode,
                targetInput,
                targetNode.inputs[targetInput].socket.name,
                styleSettings
            )
        );
    }

    return { ok: true, graph: { nodes, connections, positions, nodeOrder: orderResult.order, groupDefinitions, warnings } };
}

/**
 * Read the paint order out of a document, in the open.
 *
 * Returns the full order (every node exactly once, bottom-most first) plus the
 * problems it had to repair as `warnings`. Only a malformed `nodeOrder` refuses
 * the load; a missing or incomplete one is derivable, so it is repaired.
 */
function readNodeOrder(
    document: Partial<SerializedGraph>,
    version: number,
    nodeIds: readonly string[],
    warnings: string[]
): { ok: true; order: NodeOrder } | { ok: false; error: string } {
    if (version === 1) {
        warnings.push(
            "Loaded a version-1 graph: it has no \"nodeOrder\", so the paint order was derived from the nodes array (creation order)."
        );
        return { ok: true, order: [...nodeIds] };
    }

    const rawOrder = (document as { nodeOrder?: unknown }).nodeOrder;
    if (rawOrder === undefined || rawOrder === null) {
        warnings.push(
            "The graph has no \"nodeOrder\", so the paint order was derived from the nodes array (creation order)."
        );
        return { ok: true, order: [...nodeIds] };
    }
    if (!Array.isArray(rawOrder)) {
        return { ok: false, error: "Graph could not be loaded: \"nodeOrder\" must be an array of node ids." };
    }

    const known = new Set(nodeIds);
    const seen = new Set<string>();
    const order: NodeOrder = [];

    for (const [index, entry] of rawOrder.entries()) {
        if (typeof entry !== "string") {
            return {
                ok: false,
                error: `Graph could not be loaded: nodeOrder entry ${index} is not a node id string.`,
            };
        }
        if (!known.has(entry)) {
            warnings.push(`nodeOrder references unknown node "${entry}"; dropped.`);
            continue;
        }
        if (seen.has(entry)) {
            warnings.push(`nodeOrder lists node "${entry}" more than once; the first position was kept.`);
            continue;
        }
        seen.add(entry);
        order.push(entry);
    }

    const missing = nodeIds.filter((id) => !seen.has(id));
    if (missing.length > 0) {
        warnings.push(
            `nodeOrder did not mention ${missing.map((id) => `"${id}"`).join(", ")}; ` +
            `appended in nodes order, on top.`
        );
        order.push(...missing);
    }

    return { ok: true, order };
}

/**
 * Add a rebuilt graph to an editor, reproducing the app's connection side effects.
 *
 * Nodes get views in `graph.nodes` order; the paint order is
 * `graph.nodeOrder`, so a caller with a canvas applies it afterwards with
 * `NodeOrderKeeper.setOrder(graph.nodeOrder)` (the area plugin owns the DOM).
 */
export async function applyGraph(editor: NodeEditor<Schemes>, graph: LoadedGraph): Promise<void> {
    for (const node of graph.nodes) {
        await editor.addNode(node);
    }
    for (const connection of graph.connections) {
        await editor.addConnection(connection);
        connectGraphNodes(editor, connection);
    }
}

/**
 * Mirror of the `connectioncreate` pipe in `editorbase.ts`: teach the source
 * output and target input about each other. Codegen depends on it, so a
 * headless load has to do it explicitly.
 */
export function connectGraphNodes(
    editor: NodeEditor<Schemes>,
    connection: Connection<OnshapeNode, OnshapeNode>
): boolean {
    const io = getConnectionIO(editor, connection);
    if (io == null) {
        return false;
    }
    io.source.addConnection(io.output, io.input);
    io.target.addConnection(io.input, io.output);
    return true;
}

function validateNodeBase(serialized: unknown, index: number): string | null {
    if (serialized == null || typeof serialized !== "object") {
        return `Graph could not be loaded: node ${index} is not an object.`;
    }
    const node = serialized as Partial<SerializedNodeBase>;
    if (typeof node.id !== "string" || node.id === "") {
        return `Graph could not be loaded: node ${index} is missing an id.`;
    }
    if (node.size == null || typeof node.size.width !== "number" || typeof node.size.height !== "number") {
        return `Graph could not be loaded: node "${node.id}" is missing a numeric size.`;
    }
    if (node.group !== null && node.group !== undefined && typeof node.group !== "string") {
        return `Graph could not be loaded: node "${node.id}" has a non-string group.`;
    }

    const kind = (node as Partial<SerializedNode>).kind;
    if (kind === "CustomFeature") {
        const spec = (node as { spec?: Partial<FeatureSpecReference> }).spec;
        if (spec == null || typeof spec.featureType !== "string" || spec.featureType === "") {
            return `Graph could not be loaded: CustomFeature node "${node.id}" is missing a spec reference.`;
        }
    } else if (kind === "define-feature") {
        const define = node as { annotation?: unknown; preconditions?: unknown };
        if (define.annotation == null || !Array.isArray(define.preconditions)) {
            return `Graph could not be loaded: define-feature node "${node.id}" is missing an annotation or preconditions array.`;
        }
    }

    return null;
}

/** Convenience for callers that have JSON text rather than an object. */
export function deserializeGraphText(text: string, options: DeserializeOptions): LoadGraphResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return {
            ok: false,
            error: `Graph could not be loaded: the document is not valid JSON (${error instanceof Error ? error.message : String(error)}).`,
        };
    }
    return deserializeGraph(parsed, options);
}
