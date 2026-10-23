/**
 * Graph serializer for schema version 1.
 *
 * `serializeGraph` reads a rete `NodeEditor` plus a placement map and produces a
 * plain JSON document. `deserializeGraph` validates the document, refuses
 * anything it does not understand, and rebuilds nodes/connections without
 * touching the DOM. `applyGraph` puts the rebuilt graph into an editor the same
 * way the app does (nodes first, then connections, then the connection side
 * effects that `editorbase` installs as a pipe).
 *
 * See `docs/graph-schema.md` for the document contract.
 */
import type { NodeEditor } from "rete";
import { OnshapeNode } from "../nodes/onshapenode";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
import { DefineFeatureNode } from "../nodes/definefeaturenode";
import { OutputFeatureNode } from "../nodes/outputfeaturenode";
import { Connection, Schemes } from "../types";
import { StyleSettings } from "../stylesettings";
import { getConnectionIO } from "../utils";
import {
    GRAPH_SCHEMA_VERSION,
    SerializedConnection,
    SerializedGraph,
    SerializedNode,
    SerializedNodeBase,
    SerializedNodeKind,
    SpecResolver,
    Vec2,
    FeatureSpecReference,
} from "./graph-schema-types";

export interface LoadedGraph {
    nodes: OnshapeNode[];
    connections: Connection<OnshapeNode, OnshapeNode>[];
    /** Node id -> canvas position, for `area.translate` on load. */
    positions: Record<string, Vec2 | null>;
}

export type LoadGraphResult =
    | { ok: true; graph: LoadedGraph }
    | { ok: false; error: string };

export interface DeserializeOptions {
    /** Resolves a stored spec reference to a spec body. Required for graphs with CustomFeature nodes. */
    resolveSpec: SpecResolver;
    styleSettings?: StyleSettings;
}

const SUPPORTED_KINDS: SerializedNodeKind[] = ["CustomFeature", "define-feature", "output-feature"];

/**
 * Serialize every node and connection in `editor`.
 *
 * @param positions canvas positions keyed by node id (the rete area plugin owns
 *                  them, so they cannot be read off the node). Missing entries
 *                  are written as `null`.
 */
export function serializeGraph(
    editor: NodeEditor<Schemes>,
    positions: Record<string, Vec2 | null> = {}
): SerializedGraph {
    const nodes = editor.getNodes().map((node) => {
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

    const connections: SerializedConnection[] = editor.getConnections().map((connection) => ({
        source: connection.source,
        sourceOutput: connection.sourceOutput,
        target: connection.target,
        targetInput: connection.targetInput,
    }));

    return {
        schemaVersion: GRAPH_SCHEMA_VERSION,
        nodes,
        connections,
    };
}

/**
 * Validate and rebuild a serialized graph.
 *
 * Never throws and never silently migrates: an unknown `schemaVersion`, an
 * unknown node kind, a dangling connection or an unresolvable spec reference all
 * come back as `{ ok: false, error }` with a message naming the problem.
 */
export function deserializeGraph(raw: unknown, options: DeserializeOptions): LoadGraphResult {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, error: "Graph could not be loaded: the document is not a JSON object." };
    }

    const document = raw as Partial<SerializedGraph>;

    const version = (raw as { schemaVersion?: unknown }).schemaVersion;
    if (typeof version !== "number" || !Number.isInteger(version) || version !== GRAPH_SCHEMA_VERSION) {
        return {
            ok: false,
            error:
                `Unsupported graph schemaVersion: ${version === undefined ? "(missing)" : JSON.stringify(version)}. ` +
                `This build supports schemaVersion ${GRAPH_SCHEMA_VERSION}; refusing to load the graph.`,
        };
    }

    const styleSettings = options.styleSettings ?? new StyleSettings();
    const nodes: OnshapeNode[] = [];
    const byId = new Map<string, OnshapeNode>();
    const positions: Record<string, Vec2 | null> = {};

    if (!Array.isArray(document.nodes)) {
        return { ok: false, error: "Graph could not be loaded: \"nodes\" must be an array." };
    }

    for (const [index, serialized] of document.nodes.entries()) {
        const problem = validateNodeBase(serialized, index);
        if (problem != null) {
            return { ok: false, error: problem };
        }

        let node: OnshapeNode;
        try {
            switch (serialized.kind) {
                case "CustomFeature":
                    node = CustomFeatureNode.fromJSON(serialized, options.resolveSpec);
                    break;
                case "define-feature":
                    node = DefineFeatureNode.fromJSON(serialized);
                    break;
                case "output-feature":
                    node = OutputFeatureNode.fromJSON(serialized);
                    break;
                default:
                    return {
                        ok: false,
                        error: `Graph could not be loaded: node ${index} has unknown kind "${(serialized as SerializedNodeBase).kind}".`,
                    };
            }
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

    return { ok: true, graph: { nodes, connections, positions } };
}

/** Add a rebuilt graph to an editor, reproducing the app's connection side effects. */
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
