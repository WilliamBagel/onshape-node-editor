import { describe, expect, it } from "vitest";
import { getSpecFromFeatureSpec } from "../bttypetools";
import {
  arrayValueToFeaturescriptWithSpecs,
  defaultArrayItem,
  defaultMapValue,
  getArrayMemberSpecs,
  getMapElementSpecs,
  stripTransientSelections,
} from "../parameterarray";
import type { ParameterArrayItem, ParameterArrayType } from "../featurescripttypes";

const MEMBER_SPECS = [
  {
    btType: "BTParameterSpecMap-9999",
    parameterId: "meta",
    parameterName: "Meta",
    parameters: [
      {
        btType: "BTParameterSpecQuantity-173",
        parameterId: "size",
        parameterName: "Size",
        defaultValue: { btType: "BTMParameterQuantity-147", value: 2, units: "mm" },
      },
      {
        btType: "BTParameterSpecQuery-174",
        parameterId: "edges",
        parameterName: "Edges",
        defaultValue: { btType: "BTMParameterQueryList-148", queries: [] },
      },
    ],
  },
] as never[];

function arraySpec(defaultItems: unknown[] = []): ParameterArrayType {
  return getSpecFromFeatureSpec({
    btType: "BTParameterSpecArray-2600",
    parameterId: "items",
    parameterName: "Items",
    parameters: MEMBER_SPECS,
    defaultValue: { btType: "BTMParameterArray-2025", items: defaultItems },
  } as never) as unknown as ParameterArrayType;
}

describe("arrays of maps", () => {
  it("converts a map member and exposes its nested specs", () => {
    const spec = arraySpec();
    const mapElement = spec.elements?.[0];

    expect(mapElement?.type).toBe("map");
    const nested = getMapElementSpecs(mapElement!);
    expect(nested.map((m) => (m as { parameterId?: string }).parameterId)).toEqual(["size", "edges"]);
  });

  it("creates new items with nested map defaults", () => {
    const item = defaultArrayItem(getArrayMemberSpecs({
      btType: "BTParameterSpecArray-2600",
      parameters: MEMBER_SPECS,
    } as never));

    expect(item).toEqual({
      meta: { size: { value: 2, units: "mm" }, edges: [] },
    });
  });

  it("emits a FeatureScript array of map literals", () => {
    const spec = arraySpec();
    const items: ParameterArrayItem[] = [
      { meta: { size: { value: 3, units: "mm" }, edges: [] } },
    ];
    const code = arrayValueToFeaturescriptWithSpecs(
      { ...spec, value: items },
      getArrayMemberSpecs({
        btType: "BTParameterSpecArray-2600",
        parameters: MEMBER_SPECS,
      } as never),
    );

    expect(code).toBe('[{ "meta": { "size": 3 * mm, "edges": qUnion([]) } }]');
  });

  it("strips transient selections nested in a map item", () => {
    const spec = arraySpec();
    const items = [
      { meta: { size: { value: 3, units: "mm" }, edges: [{ selectionId: "live", nodeId: "x" }] } },
    ];

    const stripped = stripTransientSelections(spec, items);
    expect((stripped[0].meta as Record<string, unknown>).edges).toEqual([]);
    expect(defaultMapValue(spec.elements![0])).toEqual({ size: { value: 2, units: "mm" }, edges: [] });
  });
});
