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

  it("opens a category only on click, not on pointerenter; second click closes it", async () => {
    const { items, sin } = menuItems();
    const onHide = vi.fn();
    const wrapper = mount(EditorContextMenu, { props: { items, searchBar: false, onHide } });
    const category = wrapper.findAll(".block").find(b => b.text().includes("Math"));
    expect(category?.exists()).toBe(true);
    const heightBefore = wrapper.find(".menu").element.getBoundingClientRect().height;

    // Hover must not expand the category, change height, or steal focus.
    await category?.trigger("pointerenter");
    await category?.trigger("pointerleave");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".subitem")).toHaveLength(0);
    expect(wrapper.text()).not.toContain("sin");
    expect(wrapper.find(".menu").element.getBoundingClientRect().height).toBe(heightBefore);
    expect((category?.element as HTMLElement).tabIndex).toBe(-1);
    expect(document.activeElement).not.toBe(category?.element);

    // Click opens; a second click on the open category closes it.
    await category?.find(".content").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".subitem").map(s => s.text())).toEqual(["sin", "cos"]);

    await category?.find(".content").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".subitem")).toHaveLength(0);

    // Re-open and click a leaf: handler runs and the menu hides.
    await category?.find(".content").trigger("click");
    await wrapper.vm.$nextTick();
    const leaf = wrapper.findAll(".subitem").find(s => s.text() === "sin");
    await leaf?.trigger("click");
    expect(sin).toHaveBeenCalledOnce();
    expect(onHide).toHaveBeenCalledOnce();
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
