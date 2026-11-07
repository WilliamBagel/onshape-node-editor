/**
 * FeatureConfigPanel + TypePicker (feature-signature editor). The panel shows
 * the feature name and the parameter list (rename/retype/remove + add row),
 * emits to App.vue, has no member-socket dropdown and no browser dialogs.
 * TypePicker: swatch dot + dark label, wide listbox, keyboard support.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import FeatureConfigPanel from "../../components/FeatureConfigPanel.vue";
import TypePicker from "../../components/TypePicker.vue";
import { VALUE_TYPE_OPTIONS } from "../../components/valueTypeMeta";

function buildState() {
  return {
    nodeId: "define-1",
    featureName: "My Feature",
    parameters: [
      { socketKey: "definition.radius", name: "radius", valueType: "numberValueWithUnits", btType: "BTParameterSpecQuantity-173" },
      { socketKey: "definition.entities", name: "entities", valueType: "Query", btType: "BTParameterSpecQuery-174" },
    ],
  };
}

function mountPanel(state: ReturnType<typeof buildState> = buildState()) {
  return mount(FeatureConfigPanel, { props: { state: state as never } });
}

describe("FeatureConfigPanel", () => {
  it("renders the feature name and one row per parameter", () => {
    const wrapper = mountPanel();
    expect(wrapper.find('[data-testid="feature-name-input"]').exists()).toBe(true);
    expect((wrapper.find('[data-testid="feature-name-input"]').element as HTMLInputElement).value).toBe(
      "My Feature",
    );
    const rows = wrapper.findAll('[data-testid="feature-param-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].attributes("data-socket-key")).toBe("definition.radius");
    expect(rows[0].text()).toContain("definition.radius");
    wrapper.unmount();
  });

  it("has no member-socket dropdown and no browser dialogs", () => {
    const wrapper = mountPanel();
    expect(wrapper.findAll("select")).toHaveLength(0);
    expect(wrapper.findAll(".candidate-select")).toHaveLength(0);
    expect(wrapper.html()).not.toContain("Select a member socket");
    wrapper.unmount();
  });

  it("is hidden without state, close emits close", async () => {
    const bare = mount(FeatureConfigPanel, { props: { state: null } });
    expect(bare.find('[data-testid="feature-config-panel"]').exists()).toBe(false);
    bare.unmount();

    const wrapper = mountPanel();
    await wrapper.find('[data-testid="feature-config-close"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("add emits add with the typed name + type", async () => {
    const wrapper = mountPanel();
    const addButton = wrapper.find('[data-testid="feature-add-param"]');
    expect((addButton.element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.find('[data-testid="feature-new-param-name"]').setValue("depth");
    await wrapper.find('[data-testid="feature-new-param-type-button"]').trigger("click");
    const option = wrapper
      .findAll('[data-testid="type-picker-option"]')
      .find((o) => o.attributes("data-value") === "numberValueWithUnits");
    expect(option).toBeDefined();
    await option!.trigger("mousedown");
    await addButton.trigger("click");
    expect(wrapper.emitted("add")).toHaveLength(1);
    expect(wrapper.emitted("add")?.[0]?.[0]).toMatchObject({ name: "depth", valueType: "numberValueWithUnits" });
    wrapper.unmount();
  });

  it("rename emits update-param with the old socket key", async () => {
    const wrapper = mountPanel();
    const row = wrapper.findAll('[data-testid="feature-param-row"]')[0];
    await row.find("input[type='text']").setValue("diameter");
    await row.find("input[type='text']").trigger("blur");
    expect(wrapper.emitted("update-param")).toHaveLength(1);
    expect(wrapper.emitted("update-param")?.[0]?.[0]).toMatchObject({
      socketKey: "definition.radius",
      patch: { name: "diameter" },
    });
    wrapper.unmount();
  });

  it("retype emits update-param with the new type", async () => {
    const wrapper = mountPanel();
    const row = wrapper.findAll('[data-testid="feature-param-row"]')[0];
    await row.find("[data-testid^='feature-param-type-'] [data-testid$='-button']").trigger("click");
    const option = wrapper
      .findAll('[data-testid="type-picker-option"]')
      .find((o) => o.attributes("data-value") === "boolean");
    expect(option).toBeDefined();
    await option!.trigger("mousedown");
    expect(wrapper.emitted("update-param")).toHaveLength(1);
    expect(wrapper.emitted("update-param")?.[0]?.[0]).toMatchObject({
      socketKey: "definition.radius",
      patch: { valueType: "boolean" },
    });
    wrapper.unmount();
  });

  it("remove emits remove-param with the socket key", async () => {
    const wrapper = mountPanel();
    await wrapper.findAll('[data-testid="feature-param-remove"]')[0].trigger("click");
    expect(wrapper.emitted("remove-param")).toHaveLength(1);
    expect(wrapper.emitted("remove-param")?.[0]?.[0]).toMatchObject({ socketKey: "definition.radius" });
    wrapper.unmount();
  });

  it("feature-name edit emits update-name", async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-testid="feature-name-input"]').setValue("Renamed Feature");
    await wrapper.find('[data-testid="feature-name-input"]').trigger("blur");
    expect(wrapper.emitted("update-name")).toHaveLength(1);
    expect(wrapper.emitted("update-name")?.[0]?.[0]).toBe("Renamed Feature");
    wrapper.unmount();
  });
});

describe("TypePicker", () => {
  it("renders the current value as a label (not coloured text) and offers the full list", async () => {
    const wrapper = mount(TypePicker, { props: { modelValue: "unknown" } });
    expect(wrapper.find('[data-testid="type-picker-button"] .type-picker-label').text()).toBe("unknown");
    await wrapper.find('[data-testid="type-picker-button"]').trigger("click");
    const options = wrapper.findAll('[data-testid="type-picker-option"]');
    expect(options.map((o) => o.attributes("data-value"))).toEqual([...VALUE_TYPE_OPTIONS]);
    expect(wrapper.find('[data-testid="type-picker-listbox"] .type-picker-option-label').element.style.color).toBe("");
    wrapper.unmount();
  });

  it("selecting an option emits update:modelValue + change", async () => {
    const wrapper = mount(TypePicker, { props: { modelValue: "unknown" } });
    await wrapper.find('[data-testid="type-picker-button"]').trigger("click");
    const option = wrapper
      .findAll('[data-testid="type-picker-option"]')
      .find((o) => o.attributes("data-value") === "numberValueWithUnits");
    await option!.trigger("mousedown");
    expect(wrapper.emitted("update:modelValue")).toEqual([["numberValueWithUnits"]]);
    expect(wrapper.emitted("change")).toEqual([["numberValueWithUnits"]]);
    wrapper.unmount();
  });

  it("keyboard: Enter opens, arrows move, Enter selects, Escape cancels", async () => {
    const wrapper = mount(TypePicker, { props: { modelValue: "unknown" } });
    const button = wrapper.find('[data-testid="type-picker-button"]');
    await button.trigger("keydown", { key: "Enter" });
    expect(wrapper.find('[data-testid="type-picker-listbox"]').exists()).toBe(true);
    const listbox = wrapper.find('[data-testid="type-picker-listbox"]');
    await listbox.trigger("keydown", { key: "ArrowDown" });
    await listbox.trigger("keydown", { key: "Enter" });
    // Starting at index 0 (unknown), one down lands on numberValueWithUnits.
    expect(wrapper.emitted("update:modelValue")).toEqual([["numberValueWithUnits"]]);
    expect(wrapper.find('[data-testid="type-picker-listbox"]').exists()).toBe(false);
    await button.trigger("keydown", { key: "Enter" });
    expect(wrapper.find('[data-testid="type-picker-listbox"]').exists()).toBe(true);
    await wrapper.find('[data-testid="type-picker-listbox"]').trigger("keydown", { key: "Escape" });
    expect(wrapper.find('[data-testid="type-picker-listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("longest label numberValueWithUnits is in the option list", () => {
    expect([...VALUE_TYPE_OPTIONS]).toContain("numberValueWithUnits");
    const longest = [...VALUE_TYPE_OPTIONS].sort((a, b) => b.length - a.length)[0];
    expect(longest).toBe("numberValueWithUnits");
  });
});
