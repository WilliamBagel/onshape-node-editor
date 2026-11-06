import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import NodePalette from "../../components/NodePalette.vue";
import { defaultCatalog } from "../../onshape/catalog/spec-catalog";
import { buildPaletteInsertables } from "../../rete/catalog-node-factory";

// jsdom does not apply SFC scoped styles, so computed-color/contrast and
// layout-gap assertions live in the headless-Chrome probe (browser assertion).
describe("NodePalette chamfer rendering", () => {
  it("renders a capitalized name and a readable, adjacent descriptor", async () => {
    if (typeof (Element.prototype as any).scrollIntoView !== "function") {
      (Element.prototype as any).scrollIntoView = function () {};
    }
    const insertables = buildPaletteInsertables(defaultCatalog.entries);
    const wrapper = mount(NodePalette, { props: { open: true, insertables } });
    await wrapper.find(".palette-search").setValue("chamfer");
    await wrapper.vm.$nextTick();

    // The palette groups by category, so "OpChamfer" may render before
    // "Chamfer"; find the exact rendered row instead of assuming first.
    const names = wrapper.findAll(".palette-item-name").map((n) => n.text());
    expect(names).toContain("Chamfer");
    expect(names).not.toContain("chamfer");
    const chamferIdx = names.indexOf("Chamfer");
    expect(chamferIdx).toBeGreaterThanOrEqual(0);

    const nameEl = wrapper.findAll(".palette-item-name")[chamferIdx]
      .element as HTMLElement;
    const metaEl = wrapper.findAll(".palette-item-meta")[chamferIdx]
      .element as HTMLElement;
    expect(nameEl.textContent).toBe("Chamfer");
    expect(metaEl.textContent?.trim().length).toBeGreaterThan(0);

    // DOM adjacency: meta immediately follows name within the same row button.
    expect(nameEl.nextElementSibling).toBe(metaEl);
    expect(wrapper.findAll(".palette-item-meta").length).toBe(
      wrapper.findAll(".palette-item-name").length,
    );
    wrapper.unmount();
  });
});
