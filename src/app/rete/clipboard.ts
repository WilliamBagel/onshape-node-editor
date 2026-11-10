/**
 * Editor clipboard: copy a selection of nodes (plus the wires that stay
 * inside that selection) and paste it back with fresh ids.
 *
 * The snapshot stores each node's own `toJSON()` — the same contract the
 * graph serializer persists — so parameters, literals, math source and
 * feature-spec references survive a copy. A `CustomFeatureNode` additionally
 * keeps its live spec object: unlike a saved graph, the clipboard lives only
 * for this session, so it can hold the resolved `BTFeatureSpec-129` directly
 * instead of re-fetching it by reference.
 *
 * Frames, Define/Output boundary cards and every transient card (which
 * includes group Start/End boundaries) are not copyable: a frame is canvas
 * chrome rather than graph content, and a boundary card only means anything
 * inside the group definition currently being edited.
 */
import { getUID } from "rete";
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";
import { OnshapeNode } from "./nodes/onshapenode";
import { FrameNode } from "./nodes/framenode";
import { DefineFeatureNode } from "./nodes/definefeaturenode";
import { OutputFeatureNode } from "./nodes/outputfeaturenode";
import { GroupBoundaryNode } from "./nodes/groupboundarynode";
import { GroupNode } from "./nodes/groupinstancenode";
import { CustomFeatureNode } from "./nodes/customfeaturenode";
import { FunctionNode } from "./nodes/functionnode";
import { UtilityStatementNode } from "./nodes/utilitystatementnode";
import { MathExpressionNode } from "./nodes/mathexpressionnode";
import {
    ArrayConcatNode,
    ArrayIndexNode,
    ArrayLiteralNode,
    ArraySizeNode,
    BoundedForNode,
    ForEachNode,
    MapArrayNode,
} from "./nodes/arraynodes";
import { resolveUtilityStatement, utilityMeta } from "./catalog-node-factory";
import { defaultCatalog } from "../onshape/catalog/spec-catalog";
import { UTILITY_BY_ID } from "../onshape/catalog/utility-overrides";
import type { CatalogEntry } from "../onshape/catalog/types";
import type { GroupDefinition } from "./groups/groupmodel";
import type {
    SerializedArrayConcatNode,
    SerializedArrayIndexNode,
    SerializedArrayLiteralNode,
    SerializedArraySizeNode,
    SerializedBoundedForNode,
    SerializedCustomFeatureNode,
    SerializedForEachNode,
    SerializedFunctionNode,
    SerializedGroupInstanceNode,
    SerializedMapArrayNode,
    SerializedMathExpressionNode,
    SerializedNode,
    SerializedUtilityStatementNode,
    Vec2,
} from "./serialization/graph-schema-types";

/** Minimal connection shape the clipboard needs (a rete Connection fits it). */
export interface ClipboardConnectionLike {
    source: string;
    sourceOutput: string;
    target: string;
    targetInput: string;
}

export interface ClipboardEntry {
    /** Node id at copy time; connections refer to it. */
    originalId: string;
    /** Full node serialization (parameters/literals/source/type included). */
    json: SerializedNode;
    /** Live spec for a CustomFeature node, `null` for every other kind. */
    spec: BTFeatureSpec129 | null;
    position: Vec2;
    muted: boolean;
}

export interface ClipboardWire {
    source: string;
    sourceOutput: string;
    target: string;
    targetInput: string;
}

export interface ClipboardSnapshot {
    entries: ClipboardEntry[];
    /** Connections whose both endpoints live in `entries`. */
    wires: ClipboardWire[];
}

export interface PasteNode {
    originalId: string;
    id: string;
    entry: ClipboardEntry;
    position: Vec2;
}

export interface PastePlan {
    nodes: PasteNode[];
    wires: ClipboardWire[];
}

/** True for node kinds the clipboard can restore with a fresh id. */
export function isClipboardNode(node: OnshapeNode): boolean {
    if (node.transient) return false;
    if (node instanceof FrameNode) return false;
    if (node instanceof DefineFeatureNode) return false;
    if (node instanceof OutputFeatureNode) return false;
    if (node instanceof GroupBoundaryNode) return false;
    return (
        node instanceof CustomFeatureNode ||
        node instanceof FunctionNode ||
        node instanceof UtilityStatementNode ||
        node instanceof MathExpressionNode ||
        node instanceof ArrayLiteralNode ||
        node instanceof ArrayConcatNode ||
        node instanceof ArrayIndexNode ||
        node instanceof ArraySizeNode ||
        node instanceof MapArrayNode ||
        node instanceof ForEachNode ||
        node instanceof BoundedForNode ||
        node instanceof GroupNode
    );
}

function deepCopy<T>(value: T): T {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Snapshot the copyable subset of `nodes`. Returns `null` when nothing in the
 * selection may be copied (e.g. only a frame is selected).
 */
export function captureClipboard(
    nodes: readonly OnshapeNode[],
    connections: readonly ClipboardConnectionLike[],
    positionOf: (id: string) => Vec2 | null,
): ClipboardSnapshot | null {
    const entries: ClipboardEntry[] = [];
    for (const node of nodes) {
        if (!isClipboardNode(node)) continue;
        const position = positionOf(node.id) ?? { x: 0, y: 0 };
        entries.push({
            originalId: node.id,
            json: deepCopy(node.toJSON() as SerializedNode),
            spec: node instanceof CustomFeatureNode ? node.getFeatureSpec() : null,
            position: { x: position.x, y: position.y },
            muted: node.muted,
        });
    }
    if (entries.length === 0) return null;

    const copied = new Set(entries.map((entry) => entry.originalId));
    const wires: ClipboardWire[] = [];
    for (const connection of connections) {
        if (!copied.has(connection.source) || !copied.has(connection.target)) continue;
        wires.push({
            source: connection.source,
            sourceOutput: connection.sourceOutput,
            target: connection.target,
            targetInput: connection.targetInput,
        });
    }
    return { entries, wires };
}

/**
 * Build the paste plan: one fresh id per copied node, positions shifted by
 * `offset` (the editor adds 24px per paste, so repeated pastes cascade), and
 * every internal wire remapped onto the new ids.
 */
export function planPaste(
    snapshot: ClipboardSnapshot,
    offset: Vec2,
    makeId: () => string = getUID,
): PastePlan {
    const idMap = new Map<string, string>();
    const nodes: PasteNode[] = [];
    for (const entry of snapshot.entries) {
        const id = makeId();
        idMap.set(entry.originalId, id);
        nodes.push({
            originalId: entry.originalId,
            id,
            entry,
            position: { x: entry.position.x + offset.x, y: entry.position.y + offset.y },
        });
    }
    const wires: ClipboardWire[] = [];
    for (const wire of snapshot.wires) {
        const source = idMap.get(wire.source);
        const target = idMap.get(wire.target);
        if (source == null || target == null) continue;
        wires.push({ ...wire, source, target });
    }
    return { nodes, wires };
}

function catalogEntry(functionName: string): CatalogEntry | undefined {
    return defaultCatalog.entries.find(
        (entry) => entry.name === functionName && entry.kind === "value" && entry.nodeable,
    );
}

function utilityFunctionMeta(utilityId: string) {
    const override = UTILITY_BY_ID[utilityId];
    return override != null ? utilityMeta(override) : undefined;
}

/**
 * Rebuild one clipboard entry as a new node. Throws for an unknown kind so a
 * stale clipboard can never insert a half-formed node.
 */
export function restoreClipboardNode(
    entry: ClipboardEntry,
    newId: string,
    resolveGroupDefinition: (id: string) => GroupDefinition | undefined,
): OnshapeNode {
    const data = entry.json;
    let node: OnshapeNode;
    switch (data.kind) {
        case "CustomFeature": {
            if (entry.spec == null) {
                throw new Error(`Clipboard entry "${entry.originalId}" has no feature spec.`);
            }
            const custom = new CustomFeatureNode(entry.spec);
            custom.applySerializedBase(data);
            const serialized = data as SerializedCustomFeatureNode;
            for (const [parameterId, parameter] of Object.entries(serialized.parameters ?? {})) {
                custom.updateParameter(parameterId, parameter.value);
            }
            node = custom;
            break;
        }
        case "function":
            node = FunctionNode.fromJSON(data as SerializedFunctionNode, catalogEntry, utilityFunctionMeta);
            break;
        case "utility-statement":
            node = UtilityStatementNode.fromJSON(data as SerializedUtilityStatementNode, resolveUtilityStatement);
            break;
        case "math-expression":
            node = MathExpressionNode.fromJSON(data as SerializedMathExpressionNode);
            break;
        case "array-literal":
            node = ArrayLiteralNode.fromJSON(data as SerializedArrayLiteralNode);
            break;
        case "array-concat":
            node = ArrayConcatNode.fromJSON(data as SerializedArrayConcatNode);
            break;
        case "array-index":
            node = ArrayIndexNode.fromJSON(data as SerializedArrayIndexNode);
            break;
        case "array-size":
            node = ArraySizeNode.fromJSON(data as SerializedArraySizeNode);
            break;
        case "map-array":
            node = MapArrayNode.fromJSON(data as SerializedMapArrayNode);
            break;
        case "for-each":
            node = ForEachNode.fromJSON(data as SerializedForEachNode);
            break;
        case "bounded-for":
            node = BoundedForNode.fromJSON(data as SerializedBoundedForNode);
            break;
        case "group-instance": {
            const serialized = data as SerializedGroupInstanceNode;
            const definition = resolveGroupDefinition(serialized.definitionId);
            if (definition == null) {
                throw new Error(`Clipboard entry "${entry.originalId}" references missing group "${serialized.definitionId}".`);
            }
            node = GroupNode.fromJSON(serialized, definition);
            break;
        }
        default:
            throw new Error(`Clipboard cannot restore node kind "${(data as { kind: string }).kind}".`);
    }
    node.id = newId;
    node.muted = entry.muted;
    return node;
}
