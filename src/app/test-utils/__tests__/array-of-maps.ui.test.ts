import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ParameterArrayControl from "../../customization/controls/ParameterArrayControl.vue";
import { OnshapeInputControl } from "../../rete/controls/onshapeinputcontrol";
import { getSpecFromFeatureSpec } from "../../onshape-utils/bttypetools";
import type { ParameterArrayType } from "../../onshape-utils/featurescripttypes";

function arrayOfMapsControl(): OnshapeInputControl<ParameterArrayType> {
  const spec = getSpecFromFeatureSpec({
    btType: "BTParameterSpecArray-2600",
    parameterId: "items",
    parameterName: "Items",
    parameters: [
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
        ],
      },
    ],
    defaultValue: { btType: "BTMParameterArray-2025", items: [] },
  } as never) as unknown as ParameterArrayType;

  return new OnshapeInputControl<ParameterArrayType>("ParameterArray", spec, "Items");
}

describe("array of maps UI", () => {
  it("renders a nested map editor and adds items with map defaults", async () => {
    const wrapper = mount(ParameterArrayControl, {
      props: { control: arrayOfMapsControl() },
    });

    await wrapper.find(".parameter-array-add").trigger("click");

    expect(wrapper.findAll(".map-value")).toHaveLength(1);
    expect(wrapper.text()).toContain("Size");
    expect(wrapper.find(".map-value-member input, .map-value-member .os-param-input").exists()).toBe(true);

    await wrapper.find(".parameter-array-add").trigger("click");
    expect(wrapper.findAll(".map-value")).toHaveLength(2);
    wrapper.unmount();
  });
});
