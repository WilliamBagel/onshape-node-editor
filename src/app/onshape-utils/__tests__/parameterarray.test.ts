import { describe, it, expect, vi } from "vitest";
import { btTypeToFeaturescriptType, getSpecFromFeatureSpec } from "../bttypetools";
import {
    addArrayItem,
    arrayItemLabel,
    arrayValueToFeaturescript,
    arrayValueToFeaturescriptWithSpecs,
    canAddArrayItem,
    defaultArrayItem,
    getArrayMemberSpecs,
    moveArrayItem,
    removeArrayItem,
    stripTransientSelections,
} from "../parameterarray";
import type { ParameterArrayType } from "../featurescripttypes";
import { valueTypeFromBTParameterSpec } from "../valuetypes";
import { GRAPH_SCHEMA_VERSION, SerializedGraph } from "../../rete/serialization/graph-schema-types";

const quantityMember = {
    btType: "BTParameterSpecQuantity-173",
    quantityType: "LENGTH",
    defaultValue: { btType: "BTMParameterQuantity-147", value: 2, units: "meter" },
    parameterId: "length",
    parameterName: "Length",
};

const enumMember = {
    btType: "BTParameterSpecEnum-171",
    enumName: "PlaneType",
    options: ["TOP", "FRONT"],
    optionNames: ["Top", "Front"],
    defaultValue: { btType: "BTMParameterEnum-145", value: "TOP" },
    parameterId: "plane",
    parameterName: "Plane",
};

const booleanMember = {
    btType: "BTParameterSpecBoolean-170",
    defaultValue: { btType: "BTMParameterBoolean-144", value: true },
    parameterId: "enabled",
    parameterName: "Enabled",
};

const queryMember = {
    btType: "BTParameterSpecQuery-174",
    maxNumberOfPicks: -1,
    defaultValue: { btType: "BTMParameterQueryList-148", nodeId: "n1", queries: [] },
    parameterId: "entities",
    parameterName: "Entities",
};

function arraySpec(members: any[], defaultItems: any[] = []) {
    return {
        btType: "BTParameterSpecArray-2600",
        parameterId: "items",
        parameterName: "Items",
        itemName: "profile",
        itemLabelTemplate: "#entities",
        maxNumberOfPicks: 0,
        showLabelsOnly: false,
        drivenQuery: "",
        parameters: members,
        defaultValue: { btType: "BTMParameterArray-2025", items: defaultItems },
    } as any;
}

function btmItem(params: any[]) {
    return { btType: "BTMArrayParameterItem-1843", parameters: params };
}

describe("getSpecFromFeatureSpec: BTParameterSpecArray-2600 (#26)", () => {
    it("returns a ParameterArray list type, not the raw spec", () => {
        const spec = getSpecFromFeatureSpec(arraySpec([quantityMember])) as ParameterArrayType;
        expect(spec.type).toBe("ParameterArray");
        expect(spec.value).toEqual([]);
        expect(spec.element?.type).toBe("ValueWithUnits");
        expect(spec.elements).toHaveLength(1);
        expect(spec.itemName).toBe("profile");
        expect(spec.itemLabelTemplate).toBe("#entities");
        expect(spec.maxNumberOfPicks).toBe(0);
        expect((spec.element as any).parameterId).toBe("length");
    });

    it("converts BTMParameterArray-2025 defaults into item records", () => {
        const spec = getSpecFromFeatureSpec(
            arraySpec(
                [quantityMember, enumMember, booleanMember, queryMember],
                [
                    btmItem([
                        { parameterId: "length", value: 5, units: "meter" },
                        { parameterId: "plane", value: "FRONT" },
                        { parameterId: "enabled", value: false },
                        { parameterId: "entities", queries: ["q1"] },
                    ]),
                ]
            )
        ) as ParameterArrayType;
        expect(spec.value).toEqual([
            { length: { value: 5, units: "meter" }, plane: "FRONT", enabled: false, entities: [] },
        ]);
    });

    it("an unknown spec still warns rather than silently becoming a string", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const raw = { btType: "BTParameterSpecNope-9999", parameterId: "x" } as any;
        const result = getSpecFromFeatureSpec(raw);
        expect(warn).toHaveBeenCalled();
        expect(result).toBe(raw);
        warn.mockRestore();
    });
});

describe("btTypeToFeaturescriptType / value model (#26)", () => {
    it("maps an array spec to array<element>, not string", () => {
        expect(btTypeToFeaturescriptType("BTParameterSpecArray-2600")).toBe("array");
        expect(btTypeToFeaturescriptType(arraySpec([quantityMember]))).toBe("array<ValueWithUnits>");
        expect(btTypeToFeaturescriptType(arraySpec([quantityMember, enumMember]))).toBe("array<map>");
        expect(valueTypeFromBTParameterSpec(arraySpec([quantityMember]))).toEqual({
            name: "array",
            element: { name: "ValueWithUnits", units: "meter" },
        });
    });
});

describe("array add/remove/reorder logic (#26)", () => {
    const members = [quantityMember, enumMember] as any[];
    it("adds a default item and honours a positive maxNumberOfPicks", () => {
        expect(defaultArrayItem(members)).toEqual({
            length: { value: 2, units: "meter" },
            plane: "TOP",
        });
        expect(addArrayItem([], members, 0)).toHaveLength(1);
        expect(canAddArrayItem([{ length: { value: 1, units: "meter" } }], 1)).toBe(false);
        expect(addArrayItem([{ length: { value: 1, units: "meter" } }], members, 1)).toHaveLength(1);
    });

    it("removes and reorders items immutably", () => {
        const items = [{ n: 1 }, { n: 2 }, { n: 3 }];
        expect(removeArrayItem(items, 1)).toEqual([{ n: 1 }, { n: 3 }]);
        expect(removeArrayItem(items, 9)).toEqual(items);
        expect(moveArrayItem(items, 0, 2)).toEqual([{ n: 2 }, { n: 3 }, { n: 1 }]);
        expect(moveArrayItem(items, 2, -5)).toEqual([{ n: 3 }, { n: 1 }, { n: 2 }]);
        expect(items).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    });

    it("renders item labels from itemLabelTemplate and itemName", () => {
        const spec = { itemName: "profile", itemLabelTemplate: "#entities" };
        expect(arrayItemLabel(spec, 0, [queryMember] as any[])).toBe("Entities");
        expect(arrayItemLabel({ itemName: "profile" }, 1, [])).toBe("profile 2");
    });

    it("strips transient selections from query members on serialize (DR-001)", () => {
        const spec = getSpecFromFeatureSpec(arraySpec([queryMember])) as ParameterArrayType;
        const items = [
            {
                entities: [
                    { selectionId: "s1", entityType: "EDGE", occurencePath: [], selectionType: "t", workspaceMicroversionId: "w" },
                ],
            },
        ];
        expect(stripTransientSelections(spec, items)).toEqual([{ entities: [] }]);
    });
});

describe("FeatureScript array literal (#26)", () => {
    it("emits an array of member maps", () => {
        const members = [quantityMember, enumMember, booleanMember] as any[];
        const spec = getSpecFromFeatureSpec(arraySpec(members)) as ParameterArrayType;
        spec.value = [
            { length: { value: 3, units: "meter" }, plane: "FRONT", enabled: true },
            { length: { value: 1, units: "meter" }, plane: "TOP", enabled: false },
        ];
        const expected =
            '[{ "length": 3 * meter, "plane": PlaneType.FRONT, "enabled": true }, { "length": 1 * meter, "plane": PlaneType.TOP, "enabled": false }]';
        expect(arrayValueToFeaturescriptWithSpecs(spec, members)).toBe(expected);
        expect(arrayValueToFeaturescript(spec)).toBe(expected);
    });
});

describe("graph schema round trip (#26)", () => {
    it("round-trips a ParameterArray value through the graph schema", () => {
        // Serialized form (unchanged since v1, still loadable):
        //   parameters: { "items": { "type": "ParameterArray", "value": [...] } }
        // inside a SerializedCustomFeatureNode — exactly what
        // CustomFeatureNode.serializeParameters writes for a ParameterArray
        // control (transient selections already stripped by DR-001).
        const spec = getSpecFromFeatureSpec(arraySpec([quantityMember, enumMember])) as ParameterArrayType;
        const value = [
            { length: { value: 4, units: "meter" }, plane: "FRONT" },
            { length: { value: 9, units: "meter" }, plane: "TOP" },
        ];
        const graph: SerializedGraph = {
            schemaVersion: GRAPH_SCHEMA_VERSION,
            nodes: [
                {
                    id: "n1",
                    kind: "CustomFeature",
                    position: null,
                    size: { width: 0, height: 0 },
                    group: null,
                    spec: {
                        did: null, wvm: null, wvmid: null, eid: null,
                        featureType: "test", microversion: null,
                    },
                    parameters: { items: { type: "ParameterArray", value } },
                },
            ],
            connections: [],
            nodeOrder: ["n1"],
        };
        expect(graph.schemaVersion).toBe(2);
        const restored = JSON.parse(JSON.stringify(graph)) as SerializedGraph;
        expect(restored.nodes[0]).toMatchObject({
            kind: "CustomFeature",
            parameters: { items: { type: "ParameterArray", value } },
        });
        expect(spec.type).toBe("ParameterArray");
    });
});

describe("getArrayMemberSpecs", () => {
    it("reads the parameters array and tolerates a missing spec", () => {
        expect(getArrayMemberSpecs(arraySpec([quantityMember]))).toHaveLength(1);
        expect(getArrayMemberSpecs(undefined)).toEqual([]);
    });
});
