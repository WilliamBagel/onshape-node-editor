/**
 * Serialized graph schema, version 2.
 *
 * A saved graph is one JSON document:
 *
 *   {
 *     "schemaVersion": 2,
 *     "nodes": [ { "id", "kind", "position", "size", "group", ... } ],
 *     "connections": [ { "source", "sourceOutput", "target", "targetInput" } ],
 *     "nodeOrder": [ "<node id>", ... ]
 *   }
 *
 * `nodeOrder` is the canvas paint order, bottom-most first (the last id paints
 * on top). It is one list for the whole graph, not a per-node ordinal, so it
 * cannot disagree with itself. The canvas owns it (`NodeOrderKeeper` in
 * `../modified-rete/nodeorder.ts`, DR-007); the serializer records what the
 * canvas reports on save and hands it back on load.
 *
 * Node ids are stable across a save/load cycle: they are written to disk and
 * restored on load, because connection endpoints and the generator's variable
 * disambiguation are keyed by them.
 *
 * `CustomFeatureNode`s store a *reference* to their feature spec
 * (`did / wvm / wvmid / eid / featureType / microversion`), never the spec body.
 * The body is a 1,000-line `BTFeatureSpec-129` document that belongs to Onshape;
 * copying it into every saved graph would freeze a stale copy of it into the
 * file. The loader resolves the reference through a caller-supplied
 * `SpecResolver` (the spec library / API in the app, a fixture in tests).
 *
 * Parameter values are stored per `parameterId` and are read from the input
 * control (`OnshapeInputControl.getCurrentValue`) on save and pushed back through
 * `OnshapeNode.updateParameter` on load, so there is exactly one place where a
 * value lives.
 *
 * Transient selections (`QueryList` values captured with
 * `ClientMessaging.requestSelection`) are deliberately NOT persisted: DR-001 says
 * a saved graph must never contain a live selection, because it is invalidated by
 * the next document edit. A `QueryList` parameter is written with an empty
 * selection list and regenerates as `qUnion([])`.
 *
 * The full document contract is in `docs/graph-schema.md`.
 */
import type { BTFeatureSpec129 } from "onshape-typescript-fetch";
import type { Annotation } from "../../onshape-utils/featurescripttypes";
import type { CatalogPort } from "../../onshape/catalog/types";
import type { Precondition } from "../nodes/definefeaturenode";

/** Version written by this build. Version 1 is still accepted on load. */
export const GRAPH_SCHEMA_VERSION = 2;

/**
 * Versions `deserializeGraph` accepts. A version-1 document has no `nodeOrder`;
 * its paint order is derived from the `nodes` array (creation order) and the
 * load reports that it did so.
 */
export const LOADABLE_SCHEMA_VERSIONS: readonly number[] = [1, GRAPH_SCHEMA_VERSION];

/** `OnshapeNode.type` values that can appear in a saved graph. */
export type SerializedNodeKind =
    | "CustomFeature"
    | "define-feature"
    | "output-feature"
    | "function"
    | "utility-statement"
    | "array-literal"
    | "array-concat"
    | "array-index"
    | "array-size"
    | "map-array"
    | "for-each"
    | "bounded-for"
    | "math-expression"
    | "group-instance";

export interface Vec2 {
    x: number;
    y: number;
}

export interface NodeSize {
    width: number;
    height: number;
}

/**
 * Fields every node kind stores.
 *
 * `position` is owned by the canvas (the rete area plugin), not by the node, so
 * the graph serializer fills it from the caller's placement map; a bare
 * `node.toJSON()` reports `null`.
 */
export interface SerializedNodeBase {
    id: string;
    kind: SerializedNodeKind;
    position: Vec2 | null;
    size: NodeSize;
    /** Frame/group id, or null when the node is not grouped (#13 uses this). */
    group: string | null;
}

/**
 * Where a feature spec lives, so the loader can fetch it again instead of
 * trusting a copy embedded in the graph.
 *
 * `eid` / `microversion` are the element id and element microversion the spec
 * was read at; they are parsed from `BTFeatureSpec.namespace`
 * (`e<eid>::m<microversion>`), which is also what the generated import paths are
 * built from. `did` / `wvm` / `wvmid` are null when the spec's document is not
 * known to the serializer.
 */
export interface FeatureSpecReference {
    did: string | null;
    wvm: "w" | "v" | "m" | null;
    wvmid: string | null;
    eid: string | null;
    featureType: string;
    microversion: string | null;
}

/** A single control value, keyed by `parameterId` in the node's `parameters`. */
export interface SerializedParameterValue {
    /** `OnshapeInputControl.type` (e.g. `ValueWithUnits`, `Enum`, `Boolean`). */
    type: string;
    value: unknown;
}

/**
 * Resolves a stored spec reference back to a full spec. The app backs this with
 * the spec library / Onshape API; tests back it with a fixture. Return
 * `undefined` to refuse the load.
 */
export type SpecResolver = (ref: FeatureSpecReference) => BTFeatureSpec129 | undefined;

export interface SerializedCustomFeatureNode extends SerializedNodeBase {
    kind: "CustomFeature";
    spec: FeatureSpecReference;
    parameters: Record<string, SerializedParameterValue>;
}

export interface SerializedDefineFeatureNode extends SerializedNodeBase {
    kind: "define-feature";
    title: string;
    annotation: Annotation;
    preconditions: Precondition[];
}

export interface SerializedOutputFeatureNode extends SerializedNodeBase {
    kind: "output-feature";
}

/** #8: a catalog value-function node. Ports are stored by name so the node can be rebuilt without the catalog. */
export interface SerializedFunctionNode extends SerializedNodeBase {
    kind: "function";
    functionName: string;
    outputs?: CatalogPort[];
    inputs: import("../../onshape/catalog/types").CatalogPort[];
    /** Curated utility identity (issue #11), when the node came from the utility registry. */
    utilityId?: string;
    /** FeatureScript literals for unconnected inputs, keyed by input key. */
    literals?: Record<string, string>;
}

/** #20: a math expression node. Only source + type bindings persist (DR-006);
 * typeset markup and diagnostics are re-derived on load. */
export interface SerializedMathExpressionNode extends SerializedNodeBase {
    kind: "math-expression";
    source: string;
    bindings?: Record<string, import("../../onshape-utils/valuetypes").ValueType>;
    collapsed?: boolean;
}

/** #11: a curated statement utility (opTransform, instanceOnPoints). */
export interface SerializedUtilityStatementNode extends SerializedNodeBase {
    kind: "utility-statement";
    utilityId: string;
    /** FeatureScript literals for unconnected inputs, keyed by input key. */
    literals?: Record<string, string>;
}

export type SerializedNode =
    | SerializedCustomFeatureNode
    | SerializedDefineFeatureNode
    | SerializedOutputFeatureNode
    | SerializedFunctionNode
    | SerializedUtilityStatementNode
    | SerializedMathExpressionNode
    | SerializedArrayLiteralNode
    | SerializedArrayConcatNode
    | SerializedArrayIndexNode
    | SerializedArraySizeNode
    | SerializedMapArrayNode
    | SerializedForEachNode
    | SerializedBoundedForNode
    | SerializedGroupInstanceNode;

/** A placed group instance (#14): references a definition stored once per graph. */
export interface SerializedGroupInstanceNode extends SerializedNodeBase {
    kind: "group-instance";
    definitionId: string;
    muted?: boolean;
}

/** One declared boundary socket of a group definition (#14). */
export interface SerializedGroupSocket {
    id: string;
    label: string;
    direction: "input" | "output";
    nodeId: string;
    socketKey: string;
    valueType?: string;
    defaultLiteral?: string;
}

/**
 * One group definition (#14): the subgraph, stored once per graph. Member
 * nodes appear here and not in the top-level `nodes` array; instances
 * reference the definition by `id`. Member nodes may themselves be group
 * instances (nesting), referencing other definitions in the same array.
 */
export interface SerializedGroupDefinition {
    id: string;
    name: string;
    nodes: SerializedNode[];
    connections: SerializedConnection[];
    inputs: SerializedGroupSocket[];
    outputs: SerializedGroupSocket[];
}

/**
 * Issue #12: array and iteration nodes. Value types are stored whole (not
 * as names) so `array<Query>` round-trips exactly; see `valuetypes.ts`.
 */
export interface SerializedArrayLiteralNode extends SerializedNodeBase {
    kind: "array-literal";
    element: import("../../onshape-utils/valuetypes").ValueType;
    count: number;
}

export interface SerializedArrayConcatNode extends SerializedNodeBase {
    kind: "array-concat";
    element: import("../../onshape-utils/valuetypes").ValueType;
}

export interface SerializedArrayIndexNode extends SerializedNodeBase {
    kind: "array-index";
    element: import("../../onshape-utils/valuetypes").ValueType;
}

export interface SerializedArraySizeNode extends SerializedNodeBase {
    kind: "array-size";
}

export interface SerializedMapArrayNode extends SerializedNodeBase {
    kind: "map-array";
    element: import("../../onshape-utils/valuetypes").ValueType;
    resultElement: import("../../onshape-utils/valuetypes").ValueType;
    body: string;
}

export interface SerializedForEachNode extends SerializedNodeBase {
    kind: "for-each";
    body: string;
}

export interface SerializedBoundedForNode extends SerializedNodeBase {
    kind: "bounded-for";
    /** Literal loop bound; omitted when the `count` input is wired instead. */
    bound?: number;
    indexVar: string;
    body: string;
}

/**
 * A grouping frame (#13). Frames are presentation only: they are not nodes in
 * the codegen sense (no inputs/outputs, never reached by the flattening walk)
 * and they do not appear in `nodeOrder` (the canvas keeps them behind their
 * children). A child node's `group` holds the frame's id; a frame's own
 * `group` is its parent frame's id, so frames nest the same way.
 */
export interface SerializedFrame {
    id: string;
    label: string;
    color: string;
    /** When true, the frame's descendants are hidden on the canvas. */
    collapsed: boolean;
    position: Vec2 | null;
    size: NodeSize;
    /** Parent frame id, or null. */
    group: string | null;
}

export interface SerializedConnection {
    source: string;
    sourceOutput: string;
    target: string;
    targetInput: string;
}

export interface SerializedGraph {
    schemaVersion: number;
    /** Every node, in creation order (not paint order — see `nodeOrder`). */
    nodes: SerializedNode[];
    connections: SerializedConnection[];
    /**
     * Node ids, bottom-most first: the last id paints on top. Always written by
     * this build; absent in version-1 documents.
     */
    nodeOrder: string[];
    /**
     * Grouping frames (#13), in creation order. Omitted when the graph has no
     * frames, so pre-#13 documents and graphs keep their exact shape.
     */
    frames?: SerializedFrame[];
    /**
     * Group definitions (#14), stored once per graph. Omitted when empty.
     */
    groupDefinitions?: SerializedGroupDefinition[];
}

/**
 * Parse the element/microversion out of a feature spec namespace
 * (`e<elementId>::m<microversion>`), the same encoding
 * `CustomFeatureNode.getDependencies` uses for import paths.
 */
export function toFeatureSpecReference(spec: BTFeatureSpec129): FeatureSpecReference {
    const namespace = spec.namespace ?? "";
    const match = /^e([^:]+)::m([^:]+)$/.exec(namespace);
    return {
        did: null,
        wvm: null,
        wvmid: null,
        eid: match?.[1] ?? null,
        featureType: spec.featureType,
        microversion: match?.[2] ?? null,
    };
}
