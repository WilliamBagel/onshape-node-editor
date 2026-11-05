import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import EditorContextMenu from "../../customization/EditorContextMenu.vue";
import { defaultCatalog } from "../../onshape/catalog/spec-catalog";
import {
  buildPaletteInsertables,
  createNodeFromCatalogEntry,
  groupByCategory,
  nodeableEntries,
  searchPaletteInsertables,
} from "../../rete/catalog-node-factory";
import { CustomFeatureNode } from "../../rete/nodes/customfeaturenode";

/** Build context-menu items exactly as editorbase does for the canvas menu. */
function realMenuItems() {
  return groupByCategory(nodeableEntries(defaultCatalog.entries)).map(group => ({
    label: group.category,
    key: group.category,
    handler: vi.fn(),
    subitems: group.entries.map(entry => ({
      label: entry.name,
      key: entry.key,
      handler: vi.fn(() => createNodeFromCatalogEntry(entry)),
    })),
  }));
}

describe("stdlib search (chamfer)", () => {
  it("palette search finds chamfer first with the generic-definition meta", () => {
    const items = buildPaletteInsertables(defaultCatalog.entries);
    const found = searchPaletteInsertables(items, "chamfer");
    expect(found[0].name).toBe("chamfer");
    expect(found[0].meta).toContain("generic definition");
    expect(createNodeFromCatalogEntry(found[0].entry!)).toBeInstanceOf(CustomFeatureNode);
  });

  it("canvas context-menu search finds chamfer and inserts without throwing", async () => {
    const items = realMenuItems();
    const wrapper = mount(EditorContextMenu, { props: { items, searchBar: true } });
    await wrapper.find(".search").setValue("chamfer");
    await wrapper.vm.$nextTick();
    const hit = wrapper.findAll(".block").find(b => b.text().includes("chamfer"));
    expect(hit?.exists()).toBe(true);
    await hit?.trigger("click");
    // The leaf handler is the createNodeFromCatalogEntry closure from editorbase.
    const category = items.find(i => i.subitems?.some(s => s.label === "chamfer"));
    const leaf = category?.subitems?.find(s => s.label === "chamfer");
    expect(leaf?.handler).toHaveBeenCalled();
    expect((leaf?.handler as any).mock.results[0].value).toBeInstanceOf(CustomFeatureNode);
    wrapper.unmount();
  });
});
