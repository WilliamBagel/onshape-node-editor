import { describe, expect, it, vi, afterEach } from "vitest";
import { shallowMount } from "@vue/test-utils";

vi.mock("../../rete", () => ({
  createEditor: vi.fn(async () => ({ listGroupDefinitions: () => [] })),
  createEditorDev: vi.fn(async () => ({ listGroupDefinitions: () => [] })),
}));
vi.mock("../../rete/editorbase.js", () => ({ editorBase: {} }));
vi.mock("../../rete/catalog-node-factory", () => ({ buildPaletteInsertables: () => [] }));
vi.mock("../../onshape/catalog/spec-catalog", () => ({ defaultCatalog: { entries: [] } }));

import App from "../../App.vue";

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Add node shortcut (Shift+A)", () => {
  it("dispatching Shift+A to the window opens the node palette", async () => {
    const wrapper = shallowMount(App);
    expect((wrapper.vm as any).paletteOpen).toBe(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "A", shiftKey: true, bubbles: true }));
    await flush();
    await wrapper.vm.$nextTick();
    expect((wrapper.vm as any).paletteOpen).toBe(true);
    const palette = wrapper.findComponent({ name: "NodePalette" });
    expect(palette.exists()).toBe(true);
    expect(palette.props("open")).toBe(true);
    wrapper.unmount();
  });

  it("does not open the palette while typing in an input", async () => {
    const wrapper = shallowMount(App);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "A", shiftKey: true, bubbles: true }));
    await flush();
    await wrapper.vm.$nextTick();
    expect((wrapper.vm as any).paletteOpen).toBe(false);
    wrapper.unmount();
  });

  it("does not fire on plain A without Shift", async () => {
    const wrapper = shallowMount(App);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    await flush();
    await wrapper.vm.$nextTick();
    expect((wrapper.vm as any).paletteOpen).toBe(false);
    wrapper.unmount();
  });
});
