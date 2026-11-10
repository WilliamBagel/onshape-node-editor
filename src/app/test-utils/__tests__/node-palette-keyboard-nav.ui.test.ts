import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import NodePalette from "../../components/NodePalette.vue";
import ActionPalette from "../../components/ActionPalette.vue";
import { defaultCatalog } from "../../onshape/catalog/spec-catalog";
import { buildPaletteInsertables } from "../../rete/catalog-node-factory";

/**
 * Keyboard navigation must follow the order the rows are RENDERED in, not the
 * order the search ranker returns them. NodePalette renders category groups
 * (sorted by category, then name) while `searchPaletteInsertables` returns a
 * score-ordered list, so indexing the ranking made one ArrowDown jump
 * thousands of rows away from the row visibly next to the active one.
 *
 * These tests read the DOM, so they fail if navigation and rendering ever
 * disagree again.
 */

type Wrapper = VueWrapper<InstanceType<typeof NodePalette>>;

function mountPalette(): Wrapper {
  if (typeof (Element.prototype as any).scrollIntoView !== "function") {
    (Element.prototype as any).scrollIntoView = function () {};
  }
  return mount(NodePalette, {
    props: { open: true, insertables: buildPaletteInsertables(defaultCatalog.entries) },
    attachTo: document.body,
  });
}

/** Row ids in DOM (rendered) order. */
function domKeys(wrapper: Wrapper): string[] {
  return wrapper.findAll('[role="option"]').map((row) => (row.attributes("id") ?? "").replace(/^node-palette-item-|^action-palette-item-/, ""));
}

function activeKey(wrapper: Wrapper, inputSel = ".palette-search"): string | undefined {
  return wrapper.find(inputSel).attributes("aria-activedescendant")?.replace(/^node-palette-item-|^action-palette-item-/, "");
}

function activeIndex(wrapper: Wrapper, inputSel = ".palette-search"): number {
  return domKeys(wrapper).indexOf(activeKey(wrapper, inputSel) ?? "");
}

async function press(wrapper: Wrapper, key: "ArrowDown" | "ArrowUp"): Promise<void> {
  await wrapper.find(".palette-search").trigger("keydown", { key });
  await wrapper.vm.$nextTick();
}

/** A genuine pointer move: new coordinates, so hover may claim the row. */
async function movePointerTo(wrapper: Wrapper, domIndex: number, x: number, y: number): Promise<void> {
  await wrapper.findAll('[role="option"]')[domIndex].trigger("mousemove", { clientX: x, clientY: y });
  await wrapper.vm.$nextTick();
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("NodePalette arrow navigation follows the rendered (grouped) order", () => {
  it("starts on the first displayed row", () => {
    const wrapper = mountPalette();
    const keys = domKeys(wrapper);
    expect(keys.length).toBeGreaterThan(10);
    expect(activeKey(wrapper)).toBe(keys[0]);
    expect(activeIndex(wrapper)).toBe(0);
    wrapper.unmount();
  });

  it("ArrowDown moves from the first row to the second rendered row", async () => {
    const wrapper = mountPalette();
    const keys = domKeys(wrapper);
    await press(wrapper, "ArrowDown");
    expect(activeKey(wrapper)).toBe(keys[1]);
    expect(activeIndex(wrapper)).toBe(1);
    wrapper.unmount();
  });

  it("ten ArrowDowns visit ten strictly increasing DOM rows, one step each", async () => {
    const wrapper = mountPalette();
    const keys = domKeys(wrapper);
    const visited = [activeIndex(wrapper)];
    for (let i = 0; i < 10; i += 1) {
      await press(wrapper, "ArrowDown");
      visited.push(activeIndex(wrapper));
    }
    expect(visited).toEqual(Array.from({ length: 11 }, (_, i) => i));
    // No skipped rows: every visited id is the DOM row at that index.
    expect(keys[10]).toBe(activeKey(wrapper));
    wrapper.unmount();
  });

  it("ArrowUp is the exact inverse of ArrowDown", async () => {
    const wrapper = mountPalette();
    for (let i = 0; i < 6; i += 1) await press(wrapper, "ArrowDown");
    expect(activeIndex(wrapper)).toBe(6);
    for (let i = 0; i < 6; i += 1) await press(wrapper, "ArrowUp");
    expect(activeIndex(wrapper)).toBe(0);
    // Clamps at the top instead of wrapping to the end.
    await press(wrapper, "ArrowUp");
    expect(activeIndex(wrapper)).toBe(0);
    wrapper.unmount();
  });

  it("follows the rendered order for a filtered query too", async () => {
    const wrapper = mountPalette();
    await wrapper.find(".palette-search").setValue("chamfer");
    await wrapper.vm.$nextTick();
    const keys = domKeys(wrapper);
    expect(keys.length).toBeGreaterThan(2);
    expect(activeKey(wrapper)).toBe(keys[0]);
    for (let i = 1; i < keys.length; i += 1) {
      await press(wrapper, "ArrowDown");
      expect(activeKey(wrapper)).toBe(keys[i]);
    }
    wrapper.unmount();
  });

  it("keeps advancing one row per arrow while the pointer is parked over the list", async () => {
    const wrapper = mountPalette();
    const keys = domKeys(wrapper);
    // Hover row 4 for real (fresh coordinates): hover still claims the row.
    await movePointerTo(wrapper, 4, 500, 300);
    expect(activeIndex(wrapper)).toBe(4);

    // From here the pointer never moves again: as the list scrolls under it,
    // mousemove/mouseenter events at the SAME coordinates must not re-target
    // the active row (this is what an unconditional hover handler did).
    for (let i = 5; i < 12; i += 1) {
      await press(wrapper, "ArrowDown");
      expect(activeKey(wrapper)).toBe(keys[i]);
      // Scroll-under-pointer: the row now under the parked cursor fires a
      // mousemove at unchanged coordinates.
      await wrapper.findAll('[role="option"]')[i].trigger("mousemove", { clientX: 500, clientY: 300 });
      await wrapper.vm.$nextTick();
      expect(activeKey(wrapper)).toBe(keys[i]);
    }
    wrapper.unmount();
  });

  it("ignores scroll-induced hover but still honours a real pointer move", async () => {
    const wrapper = mountPalette();
    const keys = domKeys(wrapper);
    await movePointerTo(wrapper, 2, 480, 260);
    expect(activeKey(wrapper)).toBe(keys[2]);

    // Stationary pointer: same coordinates, new row under it -> ignored.
    await wrapper.findAll('[role="option"]')[7].trigger("mousemove", { clientX: 480, clientY: 260 });
    await wrapper.vm.$nextTick();
    expect(activeKey(wrapper)).toBe(keys[2]);

    // Genuine movement: new coordinates -> the hovered row wins.
    await movePointerTo(wrapper, 7, 480, 380);
    expect(activeKey(wrapper)).toBe(keys[7]);
    wrapper.unmount();
  });
});

// ActionPalette renders its results 1:1 (no grouping), so it never had the
// order bug — but it shared the unconditional hover handler, which steals the
// active row when the list scrolls under a stationary pointer.
describe("ActionPalette hover does not steal the keyboard row", () => {
  it("keeps one-row steps with the pointer parked, and still hovers on real movement", async () => {
    const wrapper = mount(ActionPalette, {
      props: { open: true, bindings: {} },
      attachTo: document.body,
    });
    await wrapper.vm.$nextTick();
    const keys = domKeys(wrapper);
    const active = () => activeKey(wrapper, ".actions-search");
    expect(keys.length).toBeGreaterThan(4);
    expect(active()).toBe(keys[0]);

    await wrapper.findAll('[role="option"]')[2].trigger("mousemove", { clientX: 520, clientY: 300 });
    await wrapper.vm.$nextTick();
    expect(active()).toBe(keys[2]);

    for (let i = 3; i < 7; i += 1) {
      await wrapper.find(".actions-search").trigger("keydown", { key: "ArrowDown" });
      await wrapper.vm.$nextTick();
      expect(active()).toBe(keys[i]);
      // Same coordinates: this is the row scrolling under the parked pointer.
      await wrapper.findAll('[role="option"]')[i].trigger("mousemove", { clientX: 520, clientY: 300 });
      await wrapper.vm.$nextTick();
      expect(active()).toBe(keys[i]);
    }

    await wrapper.findAll('[role="option"]')[9].trigger("mousemove", { clientX: 520, clientY: 420 });
    await wrapper.vm.$nextTick();
    expect(active()).toBe(keys[9]);
    wrapper.unmount();
  });
});
