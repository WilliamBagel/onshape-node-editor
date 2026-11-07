/**
 * #14 Tab focus regression: fresh body Tab must NOT be intercepted when no
 * group can be entered/exited; Tab with a selected group instance or inside
 * a group should toggle.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { shallowMount } from "@vue/test-utils";

const boundaryState = {
  definitionId: "def-1",
  name: "Group 1",
  inputs: [],
  outputs: [],
  candidates: { inputs: [], outputs: [] },
  boundaryNodeIds: { input: "boundary-input-1", output: "boundary-output-1" },
};

const mockToggleGroupEdit = vi.fn(async () => ["Top level", "Group 1"] as string[]);
let canToggle = false;
let mockControls: Record<string, unknown> | null = null;

vi.mock("../../rete", () => ({
  createEditor: vi.fn(async () => {
    mockControls = {
      listGroupDefinitions: () => [],
      getGroupBoundaryState: () => ({ ...boundaryState }),
      isGroupBoundaryNode: (id: string) => id === "boundary-input-1" || id === "boundary-output-1",
      toggleGroupEdit: mockToggleGroupEdit,
      canToggleGroupEdit: () => canToggle,
      fitView: async () => {},
      serializeGraph: () => "",
      setGroupBoundaryChangedCallback: () => {},
    };
    return mockControls;
  }),
  createEditorDev: vi.fn(async () => ({ listGroupDefinitions: () => [] })),
}));
vi.mock("../../rete/editorbase.js", () => ({ editorBase: {} }));
vi.mock("../../rete/catalog-node-factory", () => ({ buildPaletteInsertables: () => [] }));
vi.mock("../../onshape/catalog/spec-catalog", () => ({ defaultCatalog: { entries: [] } }));

import App from "../../App.vue";
import { selectedNodeIds, setSelectedNodeIds } from "../../rete/modified-rete/connection-raise";

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

function mountApp(vmExtra: Record<string, unknown> = {}) {
  const wrapper = shallowMount(App, {
    props: { onshapeParams: { workbench: { messaging: {} } } as never },
    global: { stubs: { "studio-upload": { template: "<div/>" } } },
  });
  Object.assign(wrapper.vm as unknown as Record<string, unknown>, vmExtra);
  return wrapper;
}

describe("Tab focus gating", () => {
  afterEach(() => {
    canToggle = false;
    setSelectedNodeIds([]);
    expect(selectedNodeIds.value).toEqual([]);
  });

  it("Tab on fresh body does NOT call toggleGroupEdit and does NOT preventDefault when canToggle false", async () => {
    canToggle = false;
    const wrapper = mountApp();
    await flush();
    const target = wrapper.find("main.rete").element;
    document.body.appendChild(target);
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(false);
    expect(mockToggleGroupEdit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("Tab with selected group instance (canToggle true) enters", async () => {
    canToggle = true;
    setSelectedNodeIds(["group-instance-1"]);
    const wrapper = mountApp();
    await flush();
    const target = wrapper.find("main.rete").element;
    document.body.appendChild(target);
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(mockToggleGroupEdit).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("Tab inside group (canToggle true) exits even on body target", async () => {
    canToggle = true;
    const wrapper = mountApp({ groupEditing: true });
    await flush();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(mockToggleGroupEdit).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
