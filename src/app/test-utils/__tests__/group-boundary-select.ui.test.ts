/**
 * Group boundary selection -> panel (Blender-style). Selecting a group's
 * Start/End card opens the GroupConfigPanel; selecting an unrelated node
 * does not. Uses the shared `selectedNodeIds` ref and fake editor controls.
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

vi.mock("../../rete", () => ({
  createEditor: vi.fn(async () => ({
    listGroupDefinitions: () => [],
    getGroupBoundaryState: () => ({ ...boundaryState }),
    isGroupBoundaryNode: (id: string) => id === "boundary-input-1" || id === "boundary-output-1",
    toggleGroupEdit: async () => ["Top level", "Group 1"],
    fitView: async () => {},
    serializeGraph: () => "",
  })),
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
});
