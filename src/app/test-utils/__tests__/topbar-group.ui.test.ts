/**
 * #14: the toolbar's quiet "Create Group from Selection" affordance emits
 * `createGroup`, which App.vue wires to controls.createGroupFromSelection()
 * (the same path as the F3/Shift+A palette entry and Ctrl+Shift+G).
 * Group config: the "Group inputs and outputs" button appears only while
 * editing a group and emits `toggleGroupConfig`.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TopBar from "../../components/TopBar.vue";

function mountTopBar(extraProps: Record<string, unknown> = {}) {
  return mount(TopBar, {
    props: { projectName: "My Graph", groupBreadcrumb: [], log: undefined, ...extraProps },
    global: {
      directives: { tooltip: {} },
      stubs: { SvgIcon: { template: "<svg />" }, DesignCheckTab: { template: "<div />" } },
    },
  });
}

describe("TopBar create group", () => {
  it("emits createGroup from the icon button", async () => {
    const wrapper = mountTopBar();
    const button = wrapper.find('button[aria-label="Create group from selection"]');
    expect(button.exists()).toBe(true);
    await button.trigger("click");
    expect(wrapper.emitted("createGroup")).toHaveLength(1);
    wrapper.unmount();
  });

  it("shows the group breadcrumb while editing a group", () => {
    const wrapper = mountTopBar({ groupBreadcrumb: ["Top level", "Group 1"] });
    expect(wrapper.text()).toContain("Top level / Group 1");
    wrapper.unmount();
  });

  it("hides the group inputs/outputs button when not editing a group", () => {
    const wrapper = mountTopBar();
    expect(wrapper.find('button[aria-label="Group inputs and outputs"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows the group inputs/outputs button only while editing and emits toggleGroupConfig", async () => {
    const wrapper = mountTopBar({ groupBreadcrumb: ["Top level", "Group 1"], groupEditing: true });
    const button = wrapper.find('button[aria-label="Group inputs and outputs"]');
    expect(button.exists()).toBe(true);
    await button.trigger("click");
    expect(wrapper.emitted("toggleGroupConfig")).toHaveLength(1);
    wrapper.unmount();
  });
});
