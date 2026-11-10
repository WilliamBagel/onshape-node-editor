import { ClassicPreset } from 'rete';

import { inject } from 'vue';
import { editorBase } from './editorbase';
import { OutputFeatureNode } from './nodes/outputfeaturenode';
import { DefineFeatureNode } from './nodes/definefeaturenode';

const socket = new ClassicPreset.Socket('socket');

export async function createEditor(container: HTMLElement) {
  const app = inject('app');
  if (app == null) {
    console.error('app could not be found');
  }

  const { editor, area, studioEvents, nodeOrder, fitView, deleteSelectedNodes, copySelection, pasteClipboard, createFrameFromSelection, toggleFrameCollapsed, toggleGroupEdit, exitGroupTo, canToggleGroupEdit, toggleMuteSelected, listGroupDefinitions, addGroupInstance, createGroupFromSelection, getGroupBoundaryState, isGroupBoundaryNode, addGroupBoundarySocket, addGroupBoundarySocketAny, updateGroupBoundarySocket, removeGroupBoundarySocket, setGroupBoundaryChangedCallback, isDefineFeatureNode, getDefineFeatureState, setDefineFeatureName, addDefineFeatureParameter, updateDefineFeatureParameter, removeDefineFeatureParameter, applyPreferences, addNodeFromCatalog, addArrayNode, addMathExpressionNode, addUtilityNode, serializeGraph, loadGraph, sanitizeGraph, debugSources } = await editorBase(container);

  // #8: default graph nodes come from the catalog (#7) via the factory —
  // no inline spec literals. A value function and a statement feature.
  const { defaultCatalog } = await import('../onshape/catalog/spec-catalog');
  const defaultEntries = defaultCatalog.entries.filter(e => e.nodeable && (e.kind === 'value' || e.kind === 'statement'));
  const sampleNode = await addNodeFromCatalog(defaultEntries[0], { x: 300, y: 50 });
  const sampleNode2 = await addNodeFromCatalog(defaultEntries[1] ?? defaultEntries[0], { x: 600, y: 50 });

  const featureDefinition = new DefineFeatureNode({
    annotation: {
      type: 'Feature Type Name',
      value: "My New Feature"
    },
    preconditions: [
      {
        annotation: {
          type: 'Property Function Name',
          value: 'my parameter'
        },
        btType: 'BTParameterSpecString-175'
      },
      {
        annotation: {
          type: 'Property Function Name',
          value: 'do the thing'
        },
        btType: 'BTParameterSpecBoolean-170'
      },
      // {
      //   annotation: {
      //     type: 'Property Function Name',
      //     value: 'a thing'
      //   },
      //   btType: "BTParameterSpecQuantity-173"
      // }
    ]
  });

  await editor.addNode(featureDefinition);

  const featureEndNode = new OutputFeatureNode();

  await editor.addNode(featureEndNode);

  area.translate(featureDefinition.id, { x: 0, y: 50 });
  if (sampleNode) area.translate(sampleNode.id, { x: 300, y: 50 });
  if (sampleNode2) area.translate(sampleNode2.id, { x: 600, y: 50 });
  area.translate(featureEndNode.id, { x: 900, y: 50 });

  // The default sample must open clean: prune genuinely invalid/orphaned
  // nodes and log what was removed. No-op when the sample is valid.
  const sanitizeReport = await sanitizeGraph();
  if (sanitizeReport.pruned.length > 0) {
    console.warn(`[graph-sanitize] pruned ${sanitizeReport.pruned.length} invalid node(s) from the default sample`);
  }


  (window as unknown as any)['editor'] = editor;

  // setTimeout(async () => {
  //   const featureStudioCode = await buildStudio();
  //   console.log(featureStudioCode);
  // }, 10000)

  // await editor.addConnection(new Connection(a, 'a', a.inputs['a'].socket.name, b, 'a', b.inputs['a'].socket.name, new StyleSettings()));
  return {
    studioEvents,
    serializeGraph,
    loadGraph,
    sanitizeGraph,
    getNodeOrder: () => nodeOrder.getOrder(),
    fitView,
    deleteSelectedNodes,
    copySelection,
    pasteClipboard,
    createFrameFromSelection,
    toggleFrameCollapsed,
    toggleGroupEdit,
    exitGroupTo,
    canToggleGroupEdit,
    toggleMuteSelected,
    listGroupDefinitions,
    addGroupInstance,
    createGroupFromSelection,
    getGroupBoundaryState,
    isGroupBoundaryNode,
    addGroupBoundarySocket,
    addGroupBoundarySocketAny,
    updateGroupBoundarySocket,
    removeGroupBoundarySocket,
    setGroupBoundaryChangedCallback,
    isDefineFeatureNode,
    getDefineFeatureState,
    setDefineFeatureName,
    addDefineFeatureParameter,
    updateDefineFeatureParameter,
    removeDefineFeatureParameter,
    applyPreferences,
    addNodeFromCatalog,
    addArrayNode,
    addMathExpressionNode,
    addUtilityNode,
    debugSources,
    destroy: () => area.destroy(),
    selectNode: async (nodeId: string) => {
      // #30: the standard editor's sample graph does not expose a selection API
      // to the host yet; this satisfies the EditorControls contract so the
      // design-check "Locate" action compiles. Selecting in the real editor is
      // tracked separately (see #30 follow-up).
      console.warn(`editor: selectNode(${nodeId}) is a no-op`);
    },
  };
}

