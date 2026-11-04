import { describe, it, expect } from "vitest";
import {
    checkCompatibility,
    COMPATIBILITY_COERCIONS,
    parseValueType,
    valueTypeColorKey,
    valueTypeFromBTParameterSpec,
    valueTypeFromLibraryEntry,
    valueTypeLabel,
    type ArrayValueType,
    type ValueType,
} from "../valuetypes";
import { OnshapeSocket } from "../../rete/onshapesockets";

function arr(element: ValueType): ArrayValueType {
    return { name: "array", element };
}

describe("valueTypeFromBTParameterSpec: every variant the app supports today", () => {
    it("maps quantity to ValueWithUnits and carries the units", () => {
        expect(
            valueTypeFromBTParameterSpec({
                btType: "BTParameterSpecQuantity-173",
                defaultValue: { btType: "BTMParameterQuantity-147", value: 5, units: "meter" },
            })
        ).toEqual({ name: "ValueWithUnits", units: "meter" });
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecQuantity-173" })).toEqual({
            name: "ValueWithUnits",
        });
    });

    it("maps nullable quantity to ValueWithUnits", () => {
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecNullableQuantity-715" })).toEqual({
            name: "ValueWithUnits",
        });
    });

    it("maps enum to Enum and carries the enum name", () => {
        expect(
            valueTypeFromBTParameterSpec({ btType: "BTParameterSpecEnum-171", enumName: "PlaneType" })
        ).toEqual({ name: "Enum", enumName: "PlaneType" });
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecEnum-171" })).toEqual({
            name: "Enum",
        });
    });

    it("maps multi-enum to Enum", () => {
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecMultiEnum-3118" })).toEqual({
            name: "Enum",
        });
    });

    it("maps boolean", () => {
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecBoolean-170" })).toEqual({
            name: "boolean",
        });
    });

    it("maps query", () => {
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecQuery-174" })).toEqual({
            name: "Query",
        });
    });

    it("maps string variants", () => {
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecString-175" })).toEqual({
            name: "string",
        });
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecString-170" })).toEqual({
            name: "string",
        });
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecStringWithTolerances-2535" })).toEqual({
            name: "string",
        });
    });

    it("maps foreign id to Id", () => {
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecForeignId-172" })).toEqual({
            name: "Id",
        });
    });

    it("maps array to array<member> from the nested member spec", () => {
        expect(
            valueTypeFromBTParameterSpec({
                btType: "BTParameterSpecArray-2600",
                spec: { btType: "BTParameterSpecQuery-174" },
            })
        ).toEqual({ name: "array", element: { name: "Query" } });
        expect(valueTypeFromBTParameterSpec({ btType: "BTParameterSpecArray-2600" })).toEqual({
            name: "array",
            element: { name: "unknown" },
        });
    });

    it("maps UI-only and unmodelled variants to unknown (stays permissive)", () => {
        for (const btType of [
            "BTParameterSpecButton-4111",
            "BTParameterSpecCategories-4083",
            "BTParameterSpecNotice-3132",
            "BTParameterSpecProgress-3078",
            "BTParameterSpecIcon-4779",
            "BTParameterSpecFeatureList-703",
            "BTParameterSpecReferencePartStudio-1256",
            "BTParameterSpecLookupTablePath-761",
            "BTParameterSpecSomethingNew-9999",
        ]) {
            expect(valueTypeFromBTParameterSpec({ btType })).toEqual({ name: "unknown" });
        }
    });
});

describe("parseValueType: legacy names onto the model", () => {
    it("parses the featurescripttypes vocabulary", () => {
        expect(parseValueType("Boolean")).toEqual({ name: "boolean" });
        expect(parseValueType("String")).toEqual({ name: "string" });
        expect(parseValueType("ValueWithUnits")).toEqual({ name: "ValueWithUnits" });
        expect(parseValueType("QueryList")).toEqual({ name: "Query" });
        expect(parseValueType("Selection")).toEqual({ name: "Query" });
        expect(parseValueType("Context")).toEqual({ name: "Context" });
        expect(parseValueType("Id")).toEqual({ name: "Id" });
        expect(parseValueType("map")).toEqual({ name: "map" });
        expect(parseValueType("Enum")).toEqual({ name: "Enum" });
    });

    it("parses BTParameterSpec strings via the BT mapping", () => {
        expect(parseValueType("BTParameterSpecQuery-174")).toEqual({ name: "Query" });
        expect(parseValueType("BTParameterSpecQuantity-173")).toEqual({ name: "ValueWithUnits" });
    });

    it("maps anything unrecognised to unknown", () => {
        expect(parseValueType("Entities to chamfer")).toEqual({ name: "unknown" });
        expect(parseValueType(undefined)).toEqual({ name: "unknown" });
    });
});

describe("valueTypeFromLibraryEntry", () => {
    it("uses a parseable type string when present", () => {
        expect(valueTypeFromLibraryEntry({ type: "Vector" })).toEqual({ name: "Vector" });
        expect(valueTypeFromLibraryEntry({ returnType: "ValueWithUnits" })).toEqual({
            name: "ValueWithUnits",
        });
    });

    it("lands untyped entries on unknown", () => {
        expect(valueTypeFromLibraryEntry({ name: "makeThing" })).toEqual({ name: "unknown" });
        expect(valueTypeFromLibraryEntry(null)).toEqual({ name: "unknown" });
    });
});

describe("checkCompatibility: the compatibility matrix", () => {
    const scalars: ValueType[] = [
        { name: "Vector" },
        { name: "Matrix" },
        { name: "Transform" },
        { name: "CoordSystem" },
        { name: "number" },
        { name: "ValueWithUnits" },
        { name: "boolean" },
        { name: "string" },
        { name: "Query" },
        { name: "Id" },
        { name: "Context" },
        { name: "map" },
        { name: "Enum" },
    ];

    it("accepts every type identically to itself", () => {
        for (const t of scalars) {
            expect(checkCompatibility(t, t)).toEqual({ compatible: true, coercion: "identity" });
        }
    });

    it("rejects every other scalar pairing with a reason naming both types", () => {
        const allowedCross: Array<[string, string]> = [
            ["Vector", "Transform"],
        ];
        for (const from of scalars) {
            for (const to of scalars) {
                const allowed =
                    from.name === to.name || allowedCross.some(([f, t]) => f === from.name && t === to.name);
                const check = checkCompatibility(from, to);
                if (allowed) {
                    expect(check.compatible, `${from.name} -> ${to.name}`).toBe(true);
                } else {
                    expect(check.compatible, `${from.name} -> ${to.name}`).toBe(false);
                    expect(check.reason).toContain(from.name);
                    expect(check.reason).toContain(to.name);
                }
            }
        }
    });

    it("keeps Query != Id in both directions", () => {
        expect(checkCompatibility({ name: "Query" }, { name: "Id" }).compatible).toBe(false);
        expect(checkCompatibility({ name: "Id" }, { name: "Query" }).compatible).toBe(false);
    });

    it("allows number -> ValueWithUnits only with units", () => {
        // Target knows its units: allowed.
        expect(
            checkCompatibility({ name: "number" }, { name: "ValueWithUnits", units: "meter" })
        ).toEqual({ compatible: true, coercion: "number-to-ValueWithUnits" });
        // Units supplied at check time: allowed.
        expect(
            checkCompatibility({ name: "number" }, { name: "ValueWithUnits" }, { targetUnits: "radian" })
                .compatible
        ).toBe(true);
        // No units anywhere: refused, naming both types.
        const refused = checkCompatibility({ name: "number" }, { name: "ValueWithUnits" });
        expect(refused.compatible).toBe(false);
        expect(refused.reason).toContain("number");
        expect(refused.reason).toContain("ValueWithUnits");
        // And never the reverse: units would be silently dropped.
        expect(
            checkCompatibility({ name: "ValueWithUnits", units: "meter" }, { name: "number" }).compatible
        ).toBe(false);
    });

    it("allows Vector -> Transform but not Matrix/CoordSystem -> Transform", () => {
        expect(checkCompatibility({ name: "Vector" }, { name: "Transform" }).compatible).toBe(true);
        expect(checkCompatibility({ name: "Matrix" }, { name: "Transform" }).compatible).toBe(false);
        expect(checkCompatibility({ name: "CoordSystem" }, { name: "Transform" }).compatible).toBe(false);
    });

    it("compares array element types", () => {
        expect(checkCompatibility(arr({ name: "Query" }), arr({ name: "Query" })).compatible).toBe(true);
        expect(checkCompatibility(arr({ name: "Query" }), arr({ name: "Id" })).compatible).toBe(false);
        expect(checkCompatibility(arr({ name: "Query" }), { name: "Query" }).compatible).toBe(false);
        expect(checkCompatibility({ name: "Query" }, arr({ name: "Query" })).compatible).toBe(false);
        // Element coercions apply inside arrays too.
        expect(
            checkCompatibility(
                arr({ name: "number" }),
                arr({ name: "ValueWithUnits", units: "meter" })
            ).compatible
        ).toBe(true);
        expect(
            checkCompatibility(
                arr({ name: "number" }),
                arr({ name: "ValueWithUnits" })
            ).compatible
        ).toBe(false);
    });

    it("requires enums of the same type when both are known", () => {
        expect(
            checkCompatibility({ name: "Enum", enumName: "PlaneType" }, { name: "Enum", enumName: "PlaneType" })
                .compatible
        ).toBe(true);
        expect(
            checkCompatibility({ name: "Enum", enumName: "PlaneType" }, { name: "Enum", enumName: "AxisType" })
                .compatible
        ).toBe(false);
        expect(checkCompatibility({ name: "Enum" }, { name: "Enum", enumName: "AxisType" }).compatible).toBe(
            true
        );
    });

    it("lets unknown (untyped library entries) connect to and from anything", () => {
        for (const t of scalars) {
            expect(checkCompatibility({ name: "unknown" }, t).compatible).toBe(true);
            expect(checkCompatibility(t, { name: "unknown" }).compatible).toBe(true);
        }
    });

    it("the declared coercion table matches the implemented matrix", () => {
        expect(COMPATIBILITY_COERCIONS).toEqual([
            {
                from: "number",
                to: "ValueWithUnits",
                rule: expect.any(String),
            },
            {
                from: "Vector",
                to: "Transform",
                rule: expect.any(String),
            },
        ]);
    });
});

describe("labels and colour keys", () => {
    it("renders array<T> labels recursively", () => {
        expect(valueTypeLabel(arr({ name: "Query" }))).toBe("array<Query>");
        expect(valueTypeLabel({ name: "ValueWithUnits", units: "meter" })).toBe(
            "ValueWithUnits (meter)"
        );
    });

    it("colours arrays by their element", () => {
        expect(valueTypeColorKey(arr({ name: "Query" }))).toBe("Query");
        expect(valueTypeColorKey({ name: "Vector" })).toBe("Vector");
    });
});

describe("OnshapeSocket: typed compatibility", () => {
    it("derives its value type from a legacy name", () => {
        expect(new OnshapeSocket("Context").valueType).toEqual({ name: "Context" });
        expect(new OnshapeSocket("BTParameterSpecQuery-174").valueType).toEqual({ name: "Query" });
        expect(new OnshapeSocket("Entities to chamfer").valueType).toEqual({ name: "unknown" });
    });

    it("accepts an explicit value type over the name", () => {
        const socket = new OnshapeSocket("BTParameterSpecQuantity-173", {
            name: "ValueWithUnits",
            units: "meter",
        });
        expect(socket.typeLabel).toBe("ValueWithUnits (meter)");
    });

    it("refuses incompatible sockets with a reason naming both types", () => {
        const query = new OnshapeSocket("query", { name: "Query" });
        const id = new OnshapeSocket("id", { name: "Id" });
        expect(query.isCompatibleWith(id)).toBe(false);
        const reason = query.incompatibilityReason(id);
        expect(reason).toContain("Query");
        expect(reason).toContain("Id");
    });

    it("accepts compatible and untyped sockets", () => {
        const vector = new OnshapeSocket("v", { name: "Vector" });
        const transform = new OnshapeSocket("t", { name: "Transform" });
        expect(vector.isCompatibleWith(transform)).toBe(true);
        expect(vector.incompatibilityReason(transform)).toBeNull();
        expect(new OnshapeSocket("anything").isCompatibleWith(vector)).toBe(true);
    });
});
