/**
 * GroupConfigPanel (Blender-style). The panel edits the group's interface
 * — the function signature — feature-spec style: label + type + source
 * state + remove per socket, plus an Add row per direction. Users bind by
 * dragging wires on the canvas; there is no member-socket dropdown.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";

import GroupConfigPanel from "../../components/GroupConfigPanel.vue";
import { VALUE_TYPE_OPTIONS } from "../../components/valueTypeMeta";

function buildState() {
  return {
    definitionId: "def-1",
    name: "Group 1",
    inputs: [
      {
        id: "in-1",
        label: "in one",
        direction: "input" as const,
        valueType: "Query",
        nodeId: "node-a",
        socketKey: "query",
      },
      {
        id: "in-2",
        label: "in two",
        direction: "input" as const,
        valueType: "unknown",
      },
    ],
    outputs: [
      {
        id: "out-1",
        label: "out one",
        direction: "output" as const,
        valueType: "ValueWithUnits",
        nodeId: "node-a",
        socketKey: "result",
      },
    ],
    candidates: { inputs: [], outputs: [] },
    boundaryNodeIds: { input: "boundary-input-1", output: "boundary-output-1" },
  };
}

function mountPanel(state: ReturnType<typeof buildState> = buildState()) {
  return mount(GroupConfigPanel, { props: { state: state as never } });
}

function findByTestId(wrapper: ReturnType<typeof mountPanel>, testId: string) {
  return wrapper.find(`[data-testid="${testId}"]`);
}

describe("GroupConfigPanel", () => {
  it("renders the group name and all existing boundary sockets", () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Group 1");
    const inputRows = wrapper.findAll('[data-testid="group-input-row"]');
    const outputRows = wrapper.findAll('[data-testid="group-output-row"]');
    expect(inputRows).toHaveLength(2);
    expect(outputRows).toHaveLength(1);
    const nameInputs = wrapper.findAll(".name-input");
    expect(nameInputs.map((input) => (input.element as HTMLInputElement).value)).toContain("in one");
    expect(nameInputs.map((input) => (input.element as HTMLInputElement).value)).toContain("in two");
    expect(nameInputs.map((input) => (input.element as HTMLInputElement).value)).toContain("out one");
    wrapper.unmount();
  });

  it("has no member-socket candidate dropdown", () => {
    const wrapper = mountPanel();
    expect(wrapper.html()).not.toContain("Select a member socket");
    expect(wrapper.findAll(".candidate-select")).toHaveLength(0);
    expect(wrapper.findAll("optgroup")).toHaveLength(0);
    wrapper.unmount();
  });

  it("is hidden when there is no boundary state", () => {
    const wrapper = mount(GroupConfigPanel, { props: { state: null } });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find('[data-testid="group-config-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("close button emits close", async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-testid="group-config-close"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("collapse button emits close (explicit collapse affordance)", async () => {
    const wrapper = mountPanel();
    const collapse = wrapper.find('[data-testid="group-config-collapse"]');
    expect(collapse.exists()).toBe(true);
    expect(collapse.attributes("aria-label")).toMatch(/collapse/i);
    await collapse.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("type pickers offer the full value-type list and keep their values", async () => {
    const wrapper = mountPanel();
    const pickers = wrapper.findAll('[data-testid="group-row-type-picker"]');
    // Two existing inputs + one existing output row pickers, plus one Add
    // row picker per direction.
    expect(wrapper.findAll('[data-testid="group-add-input-type"]').length).toBe(1);
    expect(wrapper.findAll('[data-testid="group-add-output-type"]').length).toBe(1);
    expect(pickers).toHaveLength(3);
    const firstLabel = pickers[0].find('[data-testid="group-row-type-picker-button"] .type-picker-label');
    expect(firstLabel.text()).toBe("Query");
    // Open the first picker: the listbox offers the shared option list.
    await pickers[0].find('[data-testid="group-row-type-picker-button"]').trigger("click");
    const options = wrapper.findAll('[data-testid="type-picker-option"]');
    expect(options.map((option) => option.attributes("data-value"))).toEqual([...VALUE_TYPE_OPTIONS]);
    expect(options.some((option) => option.attributes("data-value") === "numberValueWithUnits")).toBe(true);
    wrapper.unmount();
  });

  it("update event fires for retype and rename", async () => {
    const wrapper = mountPanel();
    const state = buildState();
    await wrapper.setProps({ state: state as never });

    // Retype through the TypePicker: open, then pick "Id".
    await wrapper.find('[data-testid="group-row-type-picker-button"]').trigger("click");
    const idOption = wrapper
      .findAll('[data-testid="type-picker-option"]')
      .find((option) => option.attributes("data-value") === "Id");
    expect(idOption).toBeDefined();
    await idOption!.trigger("mousedown");
    expect(wrapper.emitted("update")).toHaveLength(1);
    expect(wrapper.emitted("update")?.[0]?.[0]).toMatchObject({
      socketId: "in-1",
      direction: "input",
      patch: { valueType: "Id" },
    });

    const nameInput = wrapper.find(".name-input");
    await nameInput.setValue("renamed");
    await nameInput.trigger("blur");
    const rename = wrapper.emitted("update")?.filter((event) => (event[0] as { patch?: { label?: string } }).patch?.label === "renamed");
    expect(rename).toHaveLength(1);
    expect((rename?.[0]?.[0] as { patch: { label: string } }).patch.label).toBe("renamed");
    wrapper.unmount();
  });

  it("remove button emits remove for the right socket", async () => {
    const wrapper = mountPanel();
    const button = wrapper.find('[aria-label="Remove input in one"]');
    expect(button.exists()).toBe(true);
    await button.trigger("click");
    expect(wrapper.emitted("remove")).toHaveLength(1);
    expect(wrapper.emitted("remove")?.[0]?.[0]).toMatchObject({ socketId: "in-1", direction: "input" });
    wrapper.unmount();
  });

  it("Add input emits add-any (primary Add path, no candidate selection)", async () => {
    const wrapper = mountPanel();
    const addButton = findByTestId(wrapper, "group-add-input");
    expect(addButton.exists()).toBe(true);
    expect(addButton.attributes("disabled")).toBeUndefined();
    await wrapper.find('input[placeholder="New input name…"]').setValue("fresh");
    await addButton.trigger("click");
    expect(wrapper.emitted("add-any")).toHaveLength(1);
    expect(wrapper.emitted("add-any")?.[0]?.[0]).toMatchObject({ direction: "input", label: "fresh", valueType: "unknown" });
    expect(wrapper.emitted("add")).toBeUndefined();
    wrapper.unmount();
  });

  it("Add output emits add-any with the chosen type", async () => {
    const wrapper = mountPanel();
    await wrapper.find('input[placeholder="New output name…"]').setValue("result");
    // Choose Query via the add-output TypePicker.
    await wrapper.find('[data-testid="group-add-output-type-button"]').trigger("click");
    const queryOption = wrapper
      .findAll('[data-testid="type-picker-option"]')
      .find((option) => option.attributes("data-value") === "Query");
    expect(queryOption).toBeDefined();
    await queryOption!.trigger("mousedown");
    await findByTestId(wrapper, "group-add-output").trigger("click");
    expect(wrapper.emitted("add-any")).toHaveLength(1);
    expect(wrapper.emitted("add-any")?.[0]?.[0]).toMatchObject({ direction: "output", label: "result", valueType: "Query" });
    wrapper.unmount();
  });

  it("type dots use the socket palette for the selected type", () => {
    const wrapper = mountPanel();
    // Add-input row starts as unknown -> socket ink; choosing Query swaps
    // the dot to --socket-query, the Query socket colour.
    const inputDot = wrapper.find('[data-testid="group-add-input-type"] .type-picker-dot');
    expect(inputDot.attributes("style")).toContain("var(--socket-ink)");
    // The in-one row is Query-typed already.
    const rowDots = wrapper.findAll('[data-testid="group-row-type-picker"] .type-picker-dot');
    expect(rowDots[0].attributes("style")).toContain("var(--socket-query)");
    wrapper.unmount();
  });

  it("bound rows show the bound key and unbound rows explain the drag", () => {
    const wrapper = mountPanel();
    const rows = wrapper.findAll('[data-testid="group-input-row"]');
    expect(rows[0].attributes("data-bound")).toBe("true");
    expect(rows[0].text()).toContain("query");
    expect(rows[1].attributes("data-bound")).toBe("false");
    expect(rows[1].text()).toMatch(/drag it onto a member node/i);
    wrapper.unmount();
  });
});
