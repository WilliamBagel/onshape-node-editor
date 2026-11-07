/**
 * GroupConfigPanel: Blender-style Start/End Feature configuration.
 * Rows render editable names + type selects; rename/retype emit `update`,
 * remove emits `remove`, the candidate selects + add buttons emit `add`.
 * No browser dialogs are used anywhere in the panel.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import GroupConfigPanel from "../../components/GroupConfigPanel.vue";
import type { GroupBoundaryState } from "../../rete/groups/group-editor";

const fakeState: GroupBoundaryState = {
  definitionId: "def-1",
  name: "Group 1",
  inputs: [
    {
      id: "n1.depth",
      label: "depth",
      direction: "input",
      nodeId: "n1",
      socketKey: "depth",
      valueType: "number",
    },
  ],
  outputs: [
    {
      id: "n1.result",
      label: "result",
      direction: "output",
      nodeId: "n1",
      socketKey: "result",
      valueType: "Id",
    },
  ],
  candidates: {
    inputs: [
      {
        direction: "input",
        nodeId: "n2",
        nodeTitle: "Extrude",
        socketKey: "distance",
        label: "Distance",
        valueType: "ValueWithUnits",
      },
    ],
    outputs: [
      {
        direction: "output",
        nodeId: "n2",
        nodeTitle: "Extrude",
        socketKey: "face",
        label: "Face",
        valueType: "Query",
      },
    ],
  },
  boundaryNodeIds: { input: "start-node", output: "end-node" },
};

function mountPanel(state: GroupBoundaryState | null = fakeState) {
  return mount(GroupConfigPanel, {
    props: { state },
    global: {
      stubs: { SvgIcon: { template: "<svg />" } },
    },
  });
}

describe("GroupConfigPanel", () => {
  it("renders input and output rows with names and type options", () => {
    const wrapper = mountPanel();
    expect(wrapper.find('[data-testid="group-config-panel"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Group 1");
    expect(wrapper.text()).toContain("Inputs");
    expect(wrapper.text()).toContain("Outputs");
    expect(wrapper.findAll('[data-testid="group-input-row"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="group-output-row"]')).toHaveLength(1);

    const nameInput = wrapper.find('[data-testid="group-input-row"] input');
    expect((nameInput.element as HTMLInputElement).value).toBe("depth");

    const typeSelect = wrapper.find('[data-testid="group-input-row"] select');
    const optionValues = typeSelect.findAll("option").map((o) => (o.element as HTMLOptionElement).value);
    for (const expected of ["unknown", "number", "ValueWithUnits", "boolean", "string", "Query", "Id", "Context", "Vector", "Matrix", "Transform", "CoordSystem", "map", "Enum", "array"]) {
      expect(optionValues).toContain(expected);
    }
    expect((typeSelect.element as HTMLSelectElement).value).toBe("number");

    // Source: bound member socket key is displayed.
    expect(wrapper.find('[data-testid="group-input-row"] .source-label').text()).toContain("depth");
    wrapper.unmount();
  });

  it("emits update with the new label on blur", async () => {
    const wrapper = mountPanel();
    const nameInput = wrapper.find('[data-testid="group-input-row"] input');
    await nameInput.setValue("thickness");
    await nameInput.trigger("blur");
    expect(wrapper.emitted("update")).toEqual([
      [{ socketId: "n1.depth", direction: "input", patch: { label: "thickness" } }],
    ]);
    wrapper.unmount();
  });

  it("emits update with the new type on change", async () => {
    const wrapper = mountPanel();
    const typeSelect = wrapper.find('[data-testid="group-input-row"] select');
    await typeSelect.setValue("ValueWithUnits");
    expect(wrapper.emitted("update")).toEqual([
      [{ socketId: "n1.depth", direction: "input", patch: { valueType: "ValueWithUnits" } }],
    ]);
    wrapper.unmount();
  });

  it("emits remove when the remove button is clicked", async () => {
    const wrapper = mountPanel();
    const removeBtn = wrapper.find('[data-testid="group-output-row"] button[aria-label="Remove output result"]');
    expect(removeBtn.exists()).toBe(true);
    await removeBtn.trigger("click");
    expect(wrapper.emitted("remove")).toEqual([[{ socketId: "n1.result", direction: "output" }]]);
    wrapper.unmount();
  });

  it("emits add for the selected input and output candidates", async () => {
    const wrapper = mountPanel();

    const inputSelect = wrapper.find('select[aria-label="Member socket to expose as a group input"]');
    await inputSelect.setValue("n2 distance");
    await wrapper.find('[data-testid="group-add-input"]').trigger("click");
    expect(wrapper.emitted("add")).toEqual([
      [{ direction: "input", nodeId: "n2", socketKey: "distance" }],
    ]);

    const outputSelect = wrapper.find('select[aria-label="Member socket to expose as a group output"]');
    await outputSelect.setValue("n2 face");
    await wrapper.find('[data-testid="group-add-output"]').trigger("click");
    expect(wrapper.emitted("add")).toHaveLength(2);
    expect(wrapper.emitted("add")?.[1]).toEqual([
      { direction: "output", nodeId: "n2", socketKey: "face" },
    ]);
    wrapper.unmount();
  });

  it("shows an empty state explaining how to add when there are no sockets", () => {
    const empty: GroupBoundaryState = {
      ...fakeState,
      inputs: [],
      outputs: [],
    };
    const wrapper = mountPanel(empty);
    expect(wrapper.findAll('[data-testid="group-input-row"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid="group-output-row"]')).toHaveLength(0);
    expect(wrapper.text()).toContain("No inputs yet.");
    expect(wrapper.text()).toContain("No outputs yet.");
    wrapper.unmount();
  });

  it("emits close from the close button", async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-testid="group-config-close"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("renders an unbound socket row and emits add-any for a new arbitrary socket", async () => {
    const unbound: GroupBoundaryState = {
      ...fakeState,
      inputs: [{ id: "def-1.input.threshold", label: "threshold", direction: "input", valueType: "unknown" }],
      outputs: [{ id: "def-1.output.result", label: "result", direction: "output", valueType: "unknown" }],
    }
    const wrapper = mountPanel(unbound)
    const rows = wrapper.findAll('[data-testid="group-input-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].attributes('data-bound')).toBe('false')
    expect(rows[0].text()).toContain('Unbound')

    const labelInput = wrapper.find('input[aria-label="Label for a new arbitrary group input"]')
    await labelInput.setValue('depth')
    await wrapper.find('[data-testid="group-add-any-input"]').trigger('click')
    expect(wrapper.emitted('add-any')).toEqual([
      [{ direction: 'input', label: 'depth', valueType: 'unknown' }],
    ])

    await wrapper.find('[data-testid="group-add-any-output"]').trigger('click')
    expect(wrapper.emitted('add-any')?.[1]).toEqual([
      { direction: 'output', label: 'output', valueType: 'unknown' },
    ])
    wrapper.unmount()
  })

  it("renders nothing when state is null (top level)", () => {
    const wrapper = mountPanel(null);
    expect(wrapper.find('[data-testid="group-config-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
