import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import NodePalette from "../../components/NodePalette.vue";
import ActionPalette from "../../components/ActionPalette.vue";
import { defaultCatalog } from "../../onshape/catalog/spec-catalog";
import { buildPaletteInsertables } from "../../rete/catalog-node-factory";

// Accessibility wiring for the two palettes: labelled combobox search,
// listbox/option roles, and Escape closing from a row-button focus (the
// keydown handler lives on the panel, not just the search input).

async function mountNodePalette() {
  if (typeof (Element.prototype as any).scrollIntoView !== "function") {
    (Element.prototype as any).scrollIntoView = function () {};
  }
  const insertables = buildPaletteInsertables(defaultCatalog.entries);
  const canvas = document.createElement("main");
  canvas.className = "rete";
  document.body.appendChild(canvas);
  const wrapper = mount(NodePalette, {
    props: { open: false, insertables },
    attachTo: document.body,
  });
  await wrapper.setProps({ open: true });
  return { wrapper, canvas };
}

// A failed assertion must not leak a main.rete into the next test (close()
// focuses the first one in the document).
afterEach(() => {
  document.querySelectorAll("main.rete").forEach(el => el.remove());
  document.body.innerHTML = "";
});

describe("palette keyboard/aria", () => {
  it("NodePalette search is a labelled combobox wired to the listbox", async () => {
    const { wrapper, canvas } = await mountNodePalette();
    const input = wrapper.find(".palette-search");
    expect(input.attributes("aria-label")).toBe("Search nodes");
    expect(input.attributes("role")).toBe("combobox");
    expect(input.attributes("aria-expanded")).toBe("true");
    const listId = input.attributes("aria-controls");
    expect(listId).toBe("node-palette-list");
    const list = wrapper.find(`#${listId}`);
    expect(list.attributes("role")).toBe("listbox");
    const options = wrapper.findAll('[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    // aria-activedescendant points at a real option id.
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(options.some((o: (typeof options)[number]) => o.attributes("id") === input.attributes("aria-activedescendant"))).toBe(true);
    wrapper.unmount();
    canvas.remove();
  });

  it("NodePalette Escape closes when focus is on a row button, focus returns to canvas", async () => {
    const { wrapper, canvas } = await mountNodePalette();
    await wrapper.vm.$nextTick();
    const firstItem = wrapper.findAll(".palette-item")[0];
    (firstItem.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(firstItem.element);
    // Dispatch on the button: the panel-level handler must catch it via bubbling.
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    firstItem.element.dispatchEvent(event);
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(event.defaultPrevented).toBe(true);
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(canvas);
    wrapper.unmount();
    canvas.remove();
  });

  it("ActionPalette search is a combobox and Escape closes from a row button", async () => {
    if (typeof (Element.prototype as any).scrollIntoView !== "function") {
      (Element.prototype as any).scrollIntoView = function () {};
    }
    const canvas = document.createElement("main");
    canvas.className = "rete";
    document.body.appendChild(canvas);
    const wrapper = mount(ActionPalette, {
      props: { open: false, bindings: {} },
      attachTo: document.body,
    });
    await wrapper.setProps({ open: true });
    await wrapper.vm.$nextTick();
    const input = wrapper.find(".actions-search");
    expect(input.attributes("aria-label")).toBe("Search actions");
    expect(input.attributes("role")).toBe("combobox");
    expect(input.attributes("aria-expanded")).toBe("true");
    expect(input.attributes("aria-controls")).toBe("action-palette-list");
    expect(wrapper.find("#action-palette-list").attributes("role")).toBe("listbox");
    const firstItem = wrapper.findAll(".actions-item")[0];
    expect(firstItem.exists()).toBe(true);
    (firstItem.element as HTMLButtonElement).focus();
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    firstItem.element.dispatchEvent(event);
    expect(wrapper.emitted("close")).toHaveLength(1);
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(canvas);
    wrapper.unmount();
    canvas.remove();
  });
});
