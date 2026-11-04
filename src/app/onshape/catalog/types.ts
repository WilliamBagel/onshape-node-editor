/**
 * #7 — Spec library service: shared types.
 *
 * The catalog is built over the scraped FsDoc library
 * (`featurescript-library.json`) plus a curated classification allowlist
 * (`classification.json`). Nothing here is wired into the UI (that is #8):
 * this module only answers "what exists, what kind is it, and what are its
 * typed ports".
 */

/** Classification kinds. `not-node-able` is the default for anything unclassified. */
export type CatalogKind =
    | 'statement' // FeatureScript statement form: takes a Context.
    | 'value' // Pure expression form: no Context, returns a value.
    | 'type' // A FeatureScript type declaration, not callable.
    | 'enum' // An enum declaration, not callable.
    | 'const' // A const declaration, not callable.
    | 'not-node-able'; // Unclassified or unusable as a node.

/**
 * The value-type model a port is typed against. The UI-facing discriminators
 * (`Boolean`, `String`, `Enum`, `Id`, `Context`, `ValueWithUnits`,
 * `QueryList`, `Selection`) are the `OnshapeType` discriminators in
 * `onshape-utils/featurescripttypes.ts`; the rest are FeatureScript value
 * types a pure function can pass around (`Vector`, `Plane`, ...). `Unknown`
 * means the scraped type could not be curated into a node-able port.
 */
export type CatalogValueType =
    | 'Boolean'
    | 'String'
    | 'Enum'
    | 'Id'
    | 'Context'
    | 'ValueWithUnits'
    | 'QueryList'
    | 'Selection'
    | 'number'
    | 'Vector'
    | 'Plane'
    | 'CoordSystem'
    | 'Line'
    | 'Matrix'
    | 'Transform'
    | 'Query'
    | 'Unknown';

export interface CatalogPort {
    name: string;
    /** Curated value type (see `typemap.ts`). */
    valueType: CatalogValueType;
    /** The scraper's raw parameter type, kept for auditing. */
    scrapedType: string;
    /** Enum name when `valueType` is `Enum`. */
    enumName?: string;
    description: string;
}

export interface CatalogEntry {
    /** Stable key: `${name}::${descriptor}` (the dedupe key). */
    key: string;
    name: string;
    category: string;
    file: string;
    descriptor: string;
    signature: string;
    description: string;
    kind: CatalogKind;
    /** True only for statement/value entries whose ports are all typed. */
    nodeable: boolean;
    inputs: CatalogPort[];
    outputs: CatalogPort[];
}

/** One Feature Studio element, as `getFeatureStudioSpecs` addresses it. */
export interface ElementTarget {
    did: string;
    wvm: string;
    wvmid: string;
    eid: string;
}

/** Fetches the live feature specs for one element. Injected so tests never hit the network. */
export type SpecFetcher = (target: ElementTarget) => Promise<unknown[]>;
