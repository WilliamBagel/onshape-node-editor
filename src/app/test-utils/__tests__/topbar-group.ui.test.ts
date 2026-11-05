/**
 * #14: the toolbar's quiet "Create Group from Selection" affordance emits
 * `createGroup`, which App.vue wires to controls.createGroupFromSelection()
 * (the same path as the F3/Shift+A palette entry and Ctrl+Shift+G).
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import TopBar from "../../components/TopBar.vue";

function mountTopBar() {
  return mount(TopBar, {
    props: { projectName: "My Graph", groupBreadcrumb: [], log: undefined },
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
    const wrapper = mount(TopBar, {
      props: { projectName: "My Graph", groupBreadcrumb: ["Top level", "Group 1"], log: undefined },
      global: {
        directives: { tooltip: {} },
        stubs: { SvgIcon: { template: "<svg />" }, DesignCheckTab: { template: "<div />" } },
      },
    });
    expect(wrapper.text()).toContain("Top level / Group 1");
    wrapper.unmount();
  });
});
