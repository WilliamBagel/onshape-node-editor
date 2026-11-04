import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import EditorContextMenu from "../../customization/EditorContextMenu.vue";

function menuItems() {
  const sin = vi.fn();
  const chamfer = vi.fn();
  const items = [
    {
      label: "Math",
      key: "math",
      handler: vi.fn(),
      subitems: [
        { label: "sin", key: "sin", handler: sin },
        { label: "cos", key: "cos", handler: vi.fn() },
      ],
    },
    {
      label: "Onshape features",
      key: "features",
      handler: vi.fn(),
      subitems: [{ label: "chamfer", key: "chamfer", handler: chamfer }],
    },
  ];
  return { items, sin, chamfer };
}

async function search(wrapper: ReturnType<typeof mount>, term: string) {
  await wrapper.find(".search").setValue(term);
  await wrapper.vm.$nextTick();
}

describe("EditorContextMenu", () => {
  it("finds a leaf inside a category and runs its handler", async () => {
    const { items, sin } = menuItems();
    const wrapper = mount(EditorContextMenu, { props: { items, searchBar: true } });
    await search(wrapper, "sin");
    const hit = wrapper.findAll(".block").find(b => b.text().includes("sin"));
    expect(hit?.exists()).toBe(true);
    await hit?.trigger("click");
    expect(sin).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("shows a whole category when the category name matches", async () => {
    const { items } = menuItems();
    const wrapper = mount(EditorContextMenu, { props: { items, searchBar: true } });
    await search(wrapper, "math");
    const text = wrapper.text();
    expect(text).toContain("sin");
    expect(text).toContain("cos");
    expect(text).not.toContain("chamfer");
    wrapper.unmount();
  });

  it("searches Onshape features and reports no match cleanly", async () => {
    const { items } = menuItems();
    const wrapper = mount(EditorContextMenu, { props: { items, searchBar: true } });
    await search(wrapper, "chamfer");
    expect(wrapper.text()).toContain("chamfer");
    await search(wrapper, "not-a-feature");
    expect(wrapper.text()).toContain("No matching node.");
    wrapper.unmount();
  });
});
