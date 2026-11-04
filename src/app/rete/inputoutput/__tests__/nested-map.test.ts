import { describe, expect, it } from "vitest";
import { ClassicPreset } from "rete";
import { OnshapeFeatureSpecInput } from "../onshapefeaturespecinput";

/**
 * A map parameter's member specs live on the spec's own `parameters` array.
 * The UI already renders nested maps recursively (#72); this proves the model
 * now builds an OnshapeFeatureSpecInput for the nested map instead of a leaf
 * OnshapeInput, which is what made nested dropdowns inert.
 */
describe("nested map parameters", () => {
  it("builds a nested feature-spec input for a map member", () => {
    const spec = {
      btType: "BTFeatureSpec-129",
      parameters: [
        {
          btType: "BTParameterSpecMap-9999",
          parameterId: "outer",
          parameterName: "Outer",
          parameters: [
            {
              btType: "BTParameterSpecQuantity-173",
              parameterId: "inner",
              parameterName: "Inner",
              defaultValue: { btType: "BTMParameterQuantity-147", value: 2, units: "mm" },
            },
          ],
        },
      ],
    } as never;

    const input = new OnshapeFeatureSpecInput(new ClassicPreset.Socket("map"), spec);
    const outer = input.paramInputs["outer"] as unknown as OnshapeFeatureSpecInput;

    expect(outer).toBeInstanceOf(OnshapeFeatureSpecInput);
    expect(outer.label).toBe("Outer");
    expect(Object.keys(outer.paramInputs)).toContain("inner");
  });
});
