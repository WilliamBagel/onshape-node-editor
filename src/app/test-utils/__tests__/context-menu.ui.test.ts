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

  it("is a real keyboard menu: roles, activedescendant, arrows, Enter, Escape", async () => {
    const { items, sin } = menuItems();
    const onHide = vi.fn();
    const wrapper = mount(EditorContextMenu, {
      props: { items, searchBar: false, onHide },
      attachTo: document.body,
    });
    const menu = wrapper.find('[data-testid="context-menu"]');
    expect(menu.attributes("role")).toBe("menu");
    expect(menu.attributes("tabindex")).toBe("0");
    const menuitems = wrapper.findAll('[role="menuitem"]');
    expect(menuitems.length).toBeGreaterThan(0);
    expect(menuitems[0].attributes("tabindex")).toBe("-1");

    // Initial active row is the first item; arrows move it and the
    // aria-activedescendant follows, with the active class on the row.
    expect(menu.attributes("aria-activedescendant")).toBe("cm-math");
    await menu.trigger("keydown", { key: "ArrowDown" });
    expect(menu.attributes("aria-activedescendant")).toBe("cm-features");
    expect(wrapper.findAll(".block--active").map(b => b.text())).toEqual(["Onshape features"]);
    await menu.trigger("keydown", { key: "ArrowUp" });
    expect(menu.attributes("aria-activedescendant")).toBe("cm-math");

    // Enter on a category opens its inline subitems; arrows reach leaves.
    await menu.trigger("keydown", { key: "Enter" });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".subitem").map(s => s.text())).toEqual(["sin", "cos"]);
    await menu.trigger("keydown", { key: "ArrowDown" });
    expect(menu.attributes("aria-activedescendant")).toBe("cm-sin");

    // Enter activates the leaf: handler runs and the menu hides.
    await menu.trigger("keydown", { key: "Enter" });
    expect(sin).toHaveBeenCalledOnce();
    expect(onHide).toHaveBeenCalledOnce();

    // Escape hides the menu.
    await menu.trigger("keydown", { key: "Escape" });
    expect(onHide).toHaveBeenCalledTimes(2);

    // Tab is not trapped: the handler leaves the default alone.
    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    menu.element.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("in search mode, arrows move over hits and Space still types", async () => {
    const { items, sin } = menuItems();
    const onHide = vi.fn();
    const wrapper = mount(EditorContextMenu, {
      props: { items, searchBar: true, onHide },
      attachTo: document.body,
    });
    const menu = wrapper.find('[data-testid="context-menu"]');
    await search(wrapper, "si");
    await wrapper.vm.$nextTick();
    expect(menu.attributes("aria-activedescendant")).toBe("cm-sin");
    await menu.trigger("keydown", { key: "ArrowDown" });
    // Only one hit, clamped at the last row.
    expect(menu.attributes("aria-activedescendant")).toBe("cm-sin");
    // Space in the search input types a space (no activation).
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    wrapper.find(".search").element.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    expect(sin).not.toHaveBeenCalled();
    // Enter activates the active hit.
    await menu.trigger("keydown", { key: "Enter" });
    expect(sin).toHaveBeenCalledOnce();
    expect(onHide).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("renders an icon on every visible row and shortcut chips on the clipboard actions", async () => {
    const items = [
      { label: "Copy", key: "copy", icon: "#svg-icon-copy-button", shortcut: "Ctrl+C", handler: vi.fn() },
      { label: "Paste", key: "paste", icon: "#svg-icon-paste-command", shortcut: "Ctrl+V", handler: vi.fn() },
      { label: "Delete", key: "delete", icon: "#svg-icon-trash", shortcut: "Del", handler: vi.fn() },
      {
        label: "Modeling",
        key: "cat-modeling",
        icon: "#svg-icon-extrude-button",
        sectionStart: true,
        handler: vi.fn(),
        subitems: [{ label: "Chamfer", key: "chamfer", icon: "#svg-icon-chamfer-button", handler: vi.fn() }],
      },
    ];
    const wrapper = mount(EditorContextMenu, { props: { items, searchBar: true } });

    const rows = wrapper.findAll("#context-menu-list > .block");
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.find(".row-icon svg use").exists(), row.text()).toBe(true);
    }
    expect(rows[0].find(".row-icon use").attributes("href")).toBe("#svg-icon-copy-button");
    expect(rows[0].find(".row-shortcut").text()).toBe("Ctrl+C");
    expect(rows[1].find(".row-shortcut").text()).toBe("Ctrl+V");
    expect(rows[2].find(".row-shortcut").text()).toBe("Del");
    expect(rows[3].classes()).toContain("block--section-start");
    expect(rows[3].find(".row-shortcut").exists()).toBe(false);

    // Opening the category shows its icon-bearing leaf rows too.
    await rows[3].find(".content").trigger("click");
    await wrapper.vm.$nextTick();
    const leaf = wrapper.find(".subitem");
    expect(leaf.find(".row-icon svg use").attributes("href")).toBe("#svg-icon-chamfer-button");

    // Search hits keep the icon and any shortcut chip.
    await search(wrapper, "copy");
    const hit = wrapper.find("#context-menu-list > .block");
    expect(hit.find(".row-icon svg use").exists()).toBe(true);
    expect(hit.find(".row-shortcut").text()).toBe("Ctrl+C");
    wrapper.unmount();
  });
});
