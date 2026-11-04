/**
 * Typed value model for Onshape FeatureScript values (issue #9).
 *
 * Sockets used to be string-named with compatibility = name equality, which
 * could not express that a `Vector` can feed a `Transform` constructor or
 * that a `number` cannot feed a `Query`. This module is the explicit model:
 *
 * - {@link ValueType} names every value type the editor understands, using the
 *   same vocabulary as {@link ./featurescripttypes} (`ValueWithUnits`,
 *   `Query`, `Id`, `Context`, `map`, ...).
 * - {@link COMPATIBILITY_COERCIONS} is the explicit compatibility matrix:
 *   the only cross-type connections allowed, each with its rule.
 * - {@link valueTypeFromBTParameterSpec} maps every `BTParameterSpec*`
 *   variant the app supports onto the model; library entries (mostly
 *   untyped) map via {@link valueTypeFromLibraryEntry} and land on
 *   `unknown`, which is compatible with everything.
 * - {@link valueTypeLabel} / {@link valueTypeColorKey} drive the socket
 *   colour and label.
 */

/** Scalar (non-array) value type names, in FeatureScript vocabulary. */
export type ScalarValueTypeName =
    | "Vector"
    | "Matrix"
    | "Transform"
    | "CoordSystem"
    | "number"
    | "ValueWithUnits"
    | "boolean"
    | "string"
    | "Query"
    | "Id"
    | "Context"
    | "map"
    | "Enum"
    | "array"
    | "unknown";

/**
 * A FeatureScript value type. `array<T>` is represented recursively via
 * `element`; `ValueWithUnits` carries its units when known (that is what
 * makes the `number` coercion legal); `Enum` carries the enum type name.
 */
export interface ValueType {
    name: ScalarValueTypeName;
    /** Expected units for `ValueWithUnits` (e.g. `"meter"`, `"radian"`). */
    units?: string;
    /** Enum type name for `Enum` (e.g. `"PlaneType"`). */
    enumName?: string;
    /** Element type when `name === "array"` is not used; see {@link ArrayValueType}. */
    element?: ValueType;
}

/** `array<T>` value type. */
export interface ArrayValueType extends ValueType {
    name: "array";
    element: ValueType;
}

/** Any value type, including `array<T>`. */
export type AnyValueType = ValueType | ArrayValueType;

export function isArrayValueType(t: ValueType): t is ArrayValueType {
    return t.name === "array" && t.element != null;
}

export const UNKNOWN_VALUE_TYPE: ValueType = { name: "unknown" };

/**
 * Parse a legacy type string — a socket name, an `OnshapeType.type`, a
 * `btType`, or a FeatureScript keyword — into the typed model. Anything
 * unrecognised (including arbitrary input labels such as a parameter name)
 * becomes `unknown`, which is deliberately permissive: untyped things may
 * connect to anything rather than being wrongly rejected.
 */
export function parseValueType(name: string | undefined | null): ValueType {
    switch (name) {
        case "Vector":
            return { name: "Vector" };
        case "Matrix":
            return { name: "Matrix" };
        case "Transform":
            return { name: "Transform" };
        case "CoordSystem":
            return { name: "CoordSystem" };
        case "number":
        case "Number":
            return { name: "number" };
        case "ValueWithUnits":
            return { name: "ValueWithUnits" };
        case "boolean":
        case "Boolean":
            return { name: "boolean" };
        case "string":
        case "String":
            return { name: "string" };
        case "Query":
        case "QueryList":
        case "Selection":
            // A QueryList / transient selection *is* a Query in FeatureScript.
            return { name: "Query" };
        case "Id":
            return { name: "Id" };
        case "Context":
            return { name: "Context" };
        case "map":
            return { name: "map" };
        case "Enum":
        case "enum":
            return { name: "Enum" };
        case "array":
        case "ParameterArray":
            return { name: "array", element: UNKNOWN_VALUE_TYPE };
        default:
            // BTParameterSpec* strings and anything else: try the BT mapping.
            if (name != null && name.startsWith("BTParameterSpec")) {
                return valueTypeFromBTParameterSpec({ btType: name });
            }
            return { name: "unknown" };
    }
}

/** Human-readable name of a value type, e.g. `array<Query>`. */
export function valueTypeLabel(t: ValueType): string {
    if (isArrayValueType(t)) {
        return `array<${valueTypeLabel(t.element)}>`;
    }
    if (t.name === "ValueWithUnits" && t.units != null) {
        return `ValueWithUnits (${t.units})`;
    }
    if (t.name === "Enum" && t.enumName != null) {
        return `Enum (${t.enumName})`;
    }
    return t.name;
}

/**
 * Key into `StyleSettings` for the socket colour of this type. Arrays take
 * their element's colour so the graph stays readable.
 */
export function valueTypeColorKey(t: ValueType): string {
    if (isArrayValueType(t)) {
        return valueTypeColorKey(t.element);
    }
    return t.name;
}

/** A coercion rule from the compatibility matrix. */
export interface CoercionRule {
    from: string;
    to: string;
    /** Why the coercion is legal. */
    rule: string;
}

/**
 * The explicit compatibility matrix: the only cross-type connections that
 * are legal. Everything not listed here (and not identical) is refused.
 * `Query` and `Id` are deliberately absent — a query is not an id.
 */
export const COMPATIBILITY_COERCIONS: CoercionRule[] = [
    {
        from: "number",
        to: "ValueWithUnits",
        rule: "A bare number may feed a quantity parameter only when the target's units are known, so the number can be read in those units.",
    },
    {
        from: "Vector",
        to: "Transform",
        rule: "A Vector can feed a Transform constructor (translation by that vector).",
    },
];

export interface CompatibilityCheck {
    compatible: boolean;
    /** How the connection is legal: `identity`, a coercion name, or `unknown`. */
    coercion?: string;
    /** Readable refusal reason naming both types, when incompatible. */
    reason?: string;
}

export interface CompatibilityOptions {
    /** Units supplied with a bare `number` source, if any. */
    sourceUnits?: string;
    /** Units the `ValueWithUnits` target expects, if not on the type itself. */
    targetUnits?: string;
}

/**
 * Check whether a value of type `source` may be connected to an input of
 * type `target`. Returns a readable reason naming both types on refusal.
 */
export function checkCompatibility(
    source: ValueType,
    target: ValueType,
    opts: CompatibilityOptions = {}
): CompatibilityCheck {
    // Untyped library entries / unparsed names never refuse a connection.
    if (source.name === "unknown" || target.name === "unknown") {
        return { compatible: true, coercion: "unknown" };
    }

    if (isArrayValueType(source) || isArrayValueType(target)) {
        if (isArrayValueType(source) && isArrayValueType(target)) {
            const inner = checkCompatibility(source.element, target.element, opts);
            if (inner.compatible) {
                return { compatible: true, coercion: inner.coercion };
            }
            return {
                compatible: false,
                reason:
                    `Cannot connect ${valueTypeLabel(source)} to ${valueTypeLabel(target)}: ` +
                    `array elements are incompatible (${inner.reason}).`,
            };
        }
        return {
            compatible: false,
            reason:
                `Cannot connect ${valueTypeLabel(source)} to ${valueTypeLabel(target)}: ` +
                `an array cannot connect to a non-array value.`,
        };
    }

    if (source.name === target.name) {
        // Same kind: enums must agree on the enum type when both are known.
        if (
            source.name === "Enum" &&
            source.enumName != null &&
            target.enumName != null &&
            source.enumName !== target.enumName
        ) {
            return {
                compatible: false,
                reason:
                    `Cannot connect Enum (${source.enumName}) to Enum (${target.enumName}): ` +
                    `different enum types.`,
            };
        }
        return { compatible: true, coercion: "identity" };
    }

    // number -> ValueWithUnits, only with units.
    if (source.name === "number" && target.name === "ValueWithUnits") {
        const units = opts.targetUnits ?? target.units ?? opts.sourceUnits;
        if (units != null && units !== "") {
            return { compatible: true, coercion: "number-to-ValueWithUnits" };
        }
        return {
            compatible: false,
            reason:
                `Cannot connect number to ValueWithUnits: a number needs units to feed a quantity ` +
                `(expected units are unknown for this target).`,
        };
    }

    // Vector -> Transform constructor.
    if (source.name === "Vector" && target.name === "Transform") {
        return { compatible: true, coercion: "Vector-to-Transform" };
    }

    return {
        compatible: false,
        reason:
            `Cannot connect ${valueTypeLabel(source)} to ${valueTypeLabel(target)}: ` +
            `no coercion rule permits this connection.`,
    };
}

/**
 * Map a `BTParameterSpec*` descriptor onto the value-type model. Covers
 * every variant the app supports today (quantity, enum, boolean, query,
 * string, array, nullable quantity, multi-enum, foreign id); UI-only or
 * unmodelled variants land on `unknown` so they stay connectable.
 */
export function valueTypeFromBTParameterSpec(spec: {
    btType?: string;
} & Record<string, any>): ValueType {
    // Access the spec's own fields through a plain record view: BT spec
    // types are interfaces, so they don't carry an implicit index signature.
    const s: Record<string, any> = (spec ?? {}) as Record<string, any>;
    const btType = typeof s.btType === "string" ? s.btType : "";
    switch (btType) {
        case "BTParameterSpecQuantity-173": {
            const units =
                (typeof s.units === "string" ? s.units : undefined) ??
                defaultValueUnits(s.defaultValue);
            return units != null
                ? { name: "ValueWithUnits", units }
                : { name: "ValueWithUnits" };
        }
        case "BTParameterSpecNullableQuantity-715": {
            const units =
                (typeof s.units === "string" ? s.units : undefined) ??
                defaultValueUnits(s.defaultValue);
            return units != null
                ? { name: "ValueWithUnits", units }
                : { name: "ValueWithUnits" };
        }
        case "BTParameterSpecEnum-171":
        case "BTParameterSpecMultiEnum-3118":
            return typeof s.enumName === "string"
                ? { name: "Enum", enumName: s.enumName }
                : { name: "Enum" };
        case "BTParameterSpecBoolean-170":
            return { name: "boolean" };
        case "BTParameterSpecQuery-174":
            return { name: "Query" };
        case "BTParameterSpecString-175":
        case "BTParameterSpecString-170":
        case "BTParameterSpecStringWithTolerances-2535":
            return { name: "string" };
        case "BTParameterSpecForeignId-172":
            return { name: "Id" };
        case "BTParameterSpecArray-2600": {
            // The member specs live in the spec's own `parameters` array on
            // the wire (see the `BTParameterSpecArray-2600` fixtures in
            // devEditor.ts: one member for a profiles array, several for a
            // loft guide); `spec` / `memberSpec` / `member` are accepted
            // for hand-written fixtures. A single member gives array<T>;
            // several members make each item a map, hence array<map>.
            const members = Array.isArray(s.parameters) ? s.parameters : null;
            const member = members?.length === 1 ? members[0] : s.spec ?? s.memberSpec ?? s.member;
            if (members != null && members.length > 1) {
                return { name: "array", element: { name: "map" } };
            }
            const element =
                member != null && typeof member === "object"
                    ? valueTypeFromBTParameterSpec(member as { btType?: string })
                    : UNKNOWN_VALUE_TYPE;
            return { name: "array", element };
        }
        default:
            // Button, Categories, Notice, Progress, Icon, Appearance,
            // Material, Database, Derived, FeatureList, Reference*,
            // LookupTablePath, ... — UI-only or unmodelled: stay permissive.
            return { name: "unknown" };
    }
}

function defaultValueUnits(defaultValue: unknown): string | undefined {
    if (defaultValue != null && typeof defaultValue === "object") {
        const units = (defaultValue as { units?: unknown }).units;
        if (typeof units === "string" && units !== "") {
            return units;
        }
    }
    return undefined;
}

/**
 * Map a standard-library entry onto the value-type model. Library entries
 * are mostly untyped: when the entry carries a parseable type string it is
 * used, otherwise the entry is `unknown` (connectable to everything).
 */
export function valueTypeFromLibraryEntry(entry: object | null | undefined): ValueType {
    if (entry == null || typeof entry !== "object") {
        return UNKNOWN_VALUE_TYPE;
    }
    const record = entry as Record<string, unknown>;
    const typeName =
        record.type ?? record.returnType ?? record.paramType ?? record.valueType;
    if (typeof typeName === "string" && typeName !== "") {
        return parseValueType(typeName);
    }
    return UNKNOWN_VALUE_TYPE;
}
