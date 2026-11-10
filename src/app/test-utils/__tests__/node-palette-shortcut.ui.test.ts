/**
 * The Add node palette keycap must show the live `addNode` binding from the
 * settings store — Shift+A by default, and the new combo immediately after a
 * rebind. It used to hardcode "Ctrl K", which matched no binding at all.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import NodePalette from "../../components/NodePalette.vue";
import { editorSettings } from "../../ui/editorSettings";

function mountPalette() {
  return mount(NodePalette, { props: { open: true, insertables: [] } });
}

function keycap(wrapper: ReturnType<typeof mountPalette>): string {
  return wrapper.get('[data-testid="node-palette-keycap"]').text();
}

describe("NodePalette Add-node keycap", () => {
  beforeEach(() => {
    editorSettings.resetBinding("addNode");
  });
  afterEach(() => {
    editorSettings.resetBinding("addNode");
  });

  it("renders the live default binding instead of the old Ctrl K label", () => {
    const wrapper = mountPalette();
    expect(keycap(wrapper)).toBe("Shift A");
    expect(wrapper.get('[data-testid="node-palette-keycap"]').attributes("title"))
      .toBe("Shortcut: Shift+A");
    expect(wrapper.text()).not.toContain("Ctrl K");
    wrapper.unmount();
  });

  it("updates immediately after a rebind", async () => {
    const wrapper = mountPalette();
    expect(editorSettings.setBinding("addNode", "Alt+N")).toEqual({ ok: true });
    await wrapper.vm.$nextTick();
    expect(keycap(wrapper)).toBe("Alt N");
    wrapper.unmount();
  });
});
