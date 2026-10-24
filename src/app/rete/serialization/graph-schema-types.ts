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
export type SerializedNodeKind = "CustomFeature" | "define-feature" | "output-feature";

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

export type SerializedNode =
    | SerializedCustomFeatureNode
    | SerializedDefineFeatureNode
    | SerializedOutputFeatureNode;

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
