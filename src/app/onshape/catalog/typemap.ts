/**
 * #7 — Curated map from scraped parameter types to the value-type model.
 *
 * The scrape is not trustworthy as a typing source: parameter types are
 * frequently the generic `value`, `array` or `map`, or outright scraper junk
 * (`Description`, `Additional info`, `greater`, ...). Passing those through
 * would produce broken nodes, so every scraped type must be curated here and
 * anything uncurated maps to `Unknown` — which makes the entry not node-able
 * (see `spec-catalog.ts`).
 *
 * Two data-driven rules sit on top of the explicit map:
 * - a scraped type that names an `enum` entry in the library is an `Enum`
 *   port (the enum's name is recorded);
 * - a scraped type that names a `type` entry in the library (e.g. `Box3d`,
 *   `Sketch`) is itself — a real FeatureScript type used directly.
 */
import type { CatalogValueType } from './types';

/** Explicit scraped type -> value type. Keep this list deliberate and small. */
export const CURATED_TYPE_MAP: Readonly<Record<string, CatalogValueType>> = {
    // Primitives -> the OnshapeType discriminators (featurescripttypes.ts).
    boolean: 'Boolean',
    string: 'String',
    number: 'number',
    // Builtin FeatureScript types -> themselves.
    Context: 'Context',
    Id: 'Id',
    Query: 'QueryList',
    ValueWithUnits: 'ValueWithUnits',
    Vector: 'Vector',
    Plane: 'Plane',
    CoordSystem: 'CoordSystem',
    Line: 'Line',
    Matrix: 'Matrix',
    Transform: 'Transform',
    // Generics and scraper junk are deliberately absent: they map to Unknown.
};

/** Names the library declares as `type` entries (e.g. `Box3d`, `Sketch`). */
export interface TypeNameSets {
    enumNames: ReadonlySet<string>;
    typeNames: ReadonlySet<string>;
}

export interface MappedType {
    valueType: CatalogValueType;
    enumName?: string;
}

/**
 * Map one scraped parameter/return type to the value-type model.
 * `Unknown` for anything not curated — callers must treat it as not node-able.
 */
export function mapScrapedType(scrapedType: string, names: TypeNameSets): MappedType {
    const curated = CURATED_TYPE_MAP[scrapedType];
    if (curated !== undefined) {
        return { valueType: curated };
    }
    if (scrapedType !== '' && names.enumNames.has(scrapedType)) {
        return { valueType: 'Enum', enumName: scrapedType };
    }
    if (scrapedType !== '' && names.typeNames.has(scrapedType)) {
        return { valueType: scrapedType as CatalogValueType };
    }
    return { valueType: 'Unknown' };
}

/**
 * Map a live `BTParameterSpec*` btType (from `getFeatureStudioSpecs`) to the
 * value-type model. Mirrors `parameterTypeForSpec` in
 * `onshape-utils/partstudiofeature.ts` — duplicated here so the catalog does
 * not pull the whole Part Studio stack in for one lookup.
 */
const BT_TYPE_TO_VALUE_TYPE: Readonly<Record<string, CatalogValueType>> = {
    'BTParameterSpecBoolean-170': 'Boolean',
    'BTParameterSpecString-175': 'String',
    'BTParameterSpecEnum-171': 'Enum',
    'BTParameterSpecQuantity-173': 'ValueWithUnits',
    'BTParameterSpecQuery-174': 'QueryList',
    'BTParameterSpecSelection-176': 'Selection',
};

export function mapBtType(btType: string | undefined): MappedType {
    const valueType = btType !== undefined ? BT_TYPE_TO_VALUE_TYPE[btType] : undefined;
    return valueType !== undefined ? { valueType } : { valueType: 'Unknown' };
}
