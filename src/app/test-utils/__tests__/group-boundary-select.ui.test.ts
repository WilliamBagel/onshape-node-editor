/**
 * Group boundary selection -> panel (Blender-style). Selecting a group's
 * Start/End card opens the GroupConfigPanel; selecting an unrelated node
 * does not. The panel is NOT auto-opened on group entry. Tab is a canvas
 * gesture only: Tab on chrome (buttons/panel/dialog) stays focus navigation.
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
let mockControls: Record<string, unknown> | null = null;

vi.mock("../../rete", () => ({
  createEditor: vi.fn(async () => {
    mockControls = {
      listGroupDefinitions: () => [],
      getGroupBoundaryState: () => ({ ...boundaryState }),
      isGroupBoundaryNode: (id: string) => id === "boundary-input-1" || id === "boundary-output-1",
      toggleGroupEdit: mockToggleGroupEdit,
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

function enterGroupEdit(wrapper: ReturnType<typeof shallowMount>): void {
  const vm = wrapper.vm as unknown as Record<string, unknown>;
  vm.groupEditing = true;
  vm.groupBoundaryState = { ...boundaryState };
  vm.groupPanelOpen = false;
}

afterEach(() => {
  document.body.innerHTML = "";
  setSelectedNodeIds([]);
  mockToggleGroupEdit.mockClear();
});

describe("Group boundary selection opens the config panel", () => {
  it("opens the panel when the Start Feature card is selected", async () => {
    const wrapper = shallowMount(App);
    await flush();
    enterGroupEdit(wrapper);
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    expect(vm.groupPanelOpen).toBe(false);
    setSelectedNodeIds(["boundary-input-1"]);
    await flush();
    await wrapper.vm.$nextTick();
    expect(vm.groupPanelOpen).toBe(true);
    wrapper.unmount();
  });

  it("opens the panel when the End Feature card is selected", async () => {
    const wrapper = shallowMount(App);
    await flush();
    enterGroupEdit(wrapper);
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    setSelectedNodeIds(["boundary-output-1"]);
    await flush();
    await wrapper.vm.$nextTick();
    expect(vm.groupPanelOpen).toBe(true);
    wrapper.unmount();
  });

  it("does not open the panel when an unrelated node is selected", async () => {
    const wrapper = shallowMount(App);
    await flush();
    enterGroupEdit(wrapper);
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    setSelectedNodeIds(["some-member-node"]);
    await flush();
    await wrapper.vm.$nextTick();
    expect(vm.groupPanelOpen).toBe(false);
    wrapper.unmount();
  });

  it("does not open the panel at the top level even for a boundary id", async () => {
    const wrapper = shallowMount(App);
    await flush();
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    vm.groupEditing = false;
    vm.groupPanelOpen = false;
    setSelectedNodeIds(["boundary-input-1"]);
    await flush();
    await wrapper.vm.$nextTick();
    expect(vm.groupPanelOpen).toBe(false);
    wrapper.unmount();
  });

  it("the TopBar toggle still works while editing", async () => {
    const wrapper = shallowMount(App);
    await flush();
    enterGroupEdit(wrapper);
    const vm = wrapper.vm as unknown as Record<string, unknown> & {
      toggleGroupConfigPanel: () => void;
    };
    vm.toggleGroupConfigPanel();
    expect(vm.groupPanelOpen).toBe(true);
    vm.toggleGroupConfigPanel();
    expect(vm.groupPanelOpen).toBe(false);
    wrapper.unmount();
  });

  it("selectedNodeIds ref carries the boundary selection", () => {
    setSelectedNodeIds(["boundary-input-1"]);
    expect(selectedNodeIds.value).toEqual(["boundary-input-1"]);
  });

  it("entering a group does not auto-open the panel", async () => {
    const wrapper = shallowMount(App);
    await flush();
    const vm = wrapper.vm as unknown as Record<string, unknown> & {
      runToggleGroupEdit: () => Promise<void>;
    };
    // Initial (pre-entry) state is closed.
    expect(vm.groupPanelOpen).toBe(false);
    await vm.runToggleGroupEdit();
    expect(vm.groupEditing).toBe(true);
    expect(vm.groupPanelOpen).toBe(false);
    wrapper.unmount();
  });

  it("Tab on a panel control does not enter/exit the group", async () => {
    const wrapper = shallowMount(App);
    await flush();
    enterGroupEdit(wrapper);
    const button = document.createElement("button");
    button.className = "group-config-panel";
    document.body.appendChild(button);
    mockToggleGroupEdit.mockClear();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await flush();
    await wrapper.vm.$nextTick();
    expect(mockToggleGroupEdit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("Tab on a toolbar button does not enter/exit the group", async () => {
    const wrapper = shallowMount(App);
    await flush();
    enterGroupEdit(wrapper);
    const button = document.createElement("button");
    document.body.appendChild(button);
    mockToggleGroupEdit.mockClear();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await flush();
    await wrapper.vm.$nextTick();
    expect(mockToggleGroupEdit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("Tab on the canvas toggles the group", async () => {
    const wrapper = shallowMount(App, { attachTo: document.body });
    await flush();
    enterGroupEdit(wrapper);
    const canvas = document.createElement("div");
    canvas.className = "rete";
    document.body.appendChild(canvas);
    mockToggleGroupEdit.mockClear();
    // Dispatch through a canvas element child of the attached main.rete
    // so the event reaches the window listener like a real canvas Tab.
    const main = document.querySelector("main.rete");
    expect(main).not.toBeNull();
    const inner = document.createElement("div");
    main!.appendChild(inner);
    inner.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await flush();
    await wrapper.vm.$nextTick();
    expect(mockToggleGroupEdit).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    document.body.innerHTML = "";
  });
});
