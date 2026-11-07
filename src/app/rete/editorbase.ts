import { inject } from 'vue';
import { NodeEditor } from "rete";
import { Area2D, AreaExtensions, AreaPlugin, Drag } from "rete-area-plugin";
import { VuePlugin, Presets as VuePresets } from "rete-vue-plugin";
import { addCustomBackground } from "../customization/custom-background";
import { ResizeController } from "../utils/resizecontroller";
import { ConnectionSnappingPlugin, useConnectionSnapping } from "./connection-snapping/connectionsnapping";
import { Schemes, AreaExtra, Connection, OnshapeSocketData } from "./types";
import { checkKey } from '@rwh/keystrokes'

import {
    ClassicFlow,
    getSourceTarget
} from 'rete-connection-plugin';

import CustomFeatureComp from '../customization/OnshapeNode.vue';
import OutlineConnection from '../customization/OutlineConnection.vue';
import { ExtractPayload } from "rete-vue-plugin/_types/presets/classic/types";
import CustomControl from "../customization/controls/QuantityControl.vue";
import { OnshapeInputControl } from "./controls/onshapeinputcontrol"
import { Zoom } from "./modified-rete/improvedzoom";
import OnshapeSocketComponent from "../customization/OnshapeSocket.vue";
import { OnshapeSocket } from "./onshapesockets";
import { TranslateLock } from "../utils/translatelock";
import { getConnectionIO, getConnectionNodes } from "./utils";
import { CustomFeatureNode } from "./nodes/customfeaturenode";
import { snapGrid } from "./modified-rete/areasnap";
import { StyleSettings } from "./stylesettings";
import { CustomConnectionPlugin } from "./customconnectionplugin";
import { OnshapeNode } from "./nodes/onshapenode";
import { FrameNode } from "./nodes/framenode";
import FrameNodeView from "../customization/FrameNodeView.vue";
import MathExpressionNodeView from "../customization/MathExpressionNodeView.vue";
import { MathExpressionNode } from "./nodes/mathexpressionnode";
import { ScopesPlugin, Presets as ScopesPresets } from 'rete-scopes-plugin';
import { DataflowEngine } from 'rete-engine';
import { FixSelector } from './modified-rete/fixselector';
import { installNodeOrder, NodeOrderKeeper } from './modified-rete/nodeorder';
import { installConnectionRaise, syncConnectionRaise } from './modified-rete/connection-raise';
import { FRAME_HEADER_HEIGHT, FRAME_PADDING, areaZoom, computeFrameBounds, installFrameSizeSync, pinFrameElement, syncNodeSize } from './modified-rete/frame-layout';
import { clampNodePlacement } from './modified-rete/node-placement';
import { generateFeatureStudioSource, describeGeneratedFeature, GeneratedFeatureDescription } from "./graph-codegen";
import { deserializeGraphText, serializeGraph as serializeEditorGraph } from "./serialization/graph-serializer";
import type { SpecResolver } from "./serialization/graph-schema-types";
import { editorSettings, applyCanvasPreferences, type EditorPreferences } from "../ui/editorSettings";
import { ContextMenuPlugin, Presets as ContextMenuPresets } from "rete-context-menu-plugin";
import { editorContextMenuPreset } from "./editor-context-menu";
import { defaultCatalog } from "../onshape/catalog/spec-catalog";
import type { CatalogEntry } from "../onshape/catalog/types";
import { createArrayNode, createMathExpressionNode, createNodeFromCatalogEntry, createUtilityNode, groupByCategory, nodeableEntries, type ArrayNodeVariant } from "./catalog-node-factory";
import { cachedSpecResolver } from "../onshape/feature-spec-cache";
import { GroupNode } from "./nodes/groupinstancenode";
import { assertGroupableSelection, commonGroupParent, createGroupDefinition, extractBoundarySockets, wouldCreateGroupCycle, type GroupDefinition, type GroupSocketPatch } from "./groups/groupmodel";
import { GroupEditorController, type GroupBoundaryState } from "./groups/group-editor";

/** Map a settings modifier name to the name `@rwh/keystrokes` `checkKey` tracks. */
export function modifierCheckKey(modifier: string): string {
    switch (modifier) {
        case 'Control': return 'control';
        case 'Shift': return 'Shift';
        case 'Meta': return 'meta';
        case 'Alt': return 'alt';
        default: return modifier;
    }
}

// import { accumulateOnCtrl, MySelector, selectableNodes } from "./testselector";

// Module-level app reference for access from Rete components
import type { DebugNodeSource, DebugSelection } from "../onshape-utils/evalfeaturescript";
import { camelize } from "../utils/stringutils";

export let reteAppInstance: any = null;

export type StudioEvents = {
    build: () => Promise<string | undefined>;
    /**
     * The custom feature the graph defines, for `Run` (#2): `featureType`, a
     * display name and a value for each declared parameter. Pure graph
     * inspection — no Onshape call, no generated source.
     */
    describe: () => GeneratedFeatureDescription;
}

export type EditorControls = {
    studioEvents: StudioEvents
    /** #6: the open graph as a serialized JSON document (schema v2). */
    serializeGraph: () => string
    /**
     * #6: replace the editor's contents with the graph in `reteJSON`.
     * Returns the loaded node count and any non-fatal load warnings.
     * Throws (leaving the current graph untouched) when the document
     * cannot be loaded.
     */
    loadGraph: (reteJSON: string, resolveSpec: SpecResolver) => Promise<{ nodes: number; warnings: string[] }>
    /** The canvas's node paint order, bottom-most first (#27 / DR-007). */
    getNodeOrder: () => string[]
    /**
     * #30: select a node by id, replacing the current selection. Used by the
     * design-check surface's "Locate" action; a no-op for an unknown id.
     */
    selectNode: (nodeId: string) => Promise<void>
    /** #36: zoom the canvas to fit all nodes (the Fit view shortcut). */
    fitView: () => Promise<void>
    /** #36: remove the selected nodes; returns how many were removed. */
    deleteSelectedNodes: () => Promise<number>
    /** #13: wrap the selected non-frame nodes in a new frame. Null when nothing is selected. */
    createFrameFromSelection: () => Promise<FrameNode | null>
    /** #13: flip a frame's collapsed state; descendants hide/show in place. */
    toggleFrameCollapsed: (frameId: string) => Promise<void>
    /** #14: Tab — enter the selected group instance, or exit one level. */
    toggleGroupEdit: () => Promise<string[]>
    /** #14: M — mute the selected nodes; returns how many changed. */
    toggleMuteSelected: () => Promise<number>
    /** #14: known group definitions, for placing another instance. */
    listGroupDefinitions: () => GroupDefinition[]
    /** #14: place another instance of a group definition. */
    addGroupInstance: (definitionId: string) => Promise<GroupNode | null>
    /** #14: wrap the selected non-frame nodes in a new group definition. */
    createGroupFromSelection: () => Promise<GroupNode | null>
    /** #14: boundary configuration for the group currently being edited. */
    getGroupBoundaryState: () => GroupBoundaryState | null
    /** #14: expose one member socket as a group input/output. */
    addGroupBoundarySocket: (direction: "input" | "output", nodeId: string, socketKey: string) => Promise<boolean>
    /** #14: rename or retype an existing group boundary socket. */
    updateGroupBoundarySocket: (socketId: string, patch: GroupSocketPatch, direction?: "input" | "output") => Promise<boolean>
    /** #14: remove a group boundary socket. */
    removeGroupBoundarySocket: (socketId: string, direction?: "input" | "output") => Promise<boolean>
    /** #36: apply live canvas preferences (grid visibility) without a reload. */
    applyPreferences: (prefs: EditorPreferences) => void
    /** #8: create a node from a catalog entry at a canvas position (default: viewport centre). */
    addNodeFromCatalog: (entry: CatalogEntry, position?: { x: number; y: number }) => Promise<OnshapeNode | null>
    /** #73: create an array/iteration node by variant (palette "Array" group). */
    addArrayNode: (variant: ArrayNodeVariant, position?: { x: number; y: number }) => Promise<OnshapeNode | null>
    /** #73: create a math expression node (palette "Math" group). */
    addMathExpressionNode: (position?: { x: number; y: number }) => Promise<OnshapeNode | null>
    /** #73: create a curated utility node by id (palette "Utility" group). */
    addUtilityNode: (utilityId: string, position?: { x: number; y: number }) => Promise<OnshapeNode | null>
    /**
     * #16: debug-grid sources for the #15 harness — one statement block per
     * non-frame node, and one selection per output socket.
     */
    debugSources?: () => { nodes: DebugNodeSource[]; selections: DebugSelection[] }
    destroy: () => void
}

type EditorBaseInfo = {
    editor: NodeEditor<Schemes>,
    area: AreaPlugin<Schemes, AreaExtra>,
    connection: ConnectionSnappingPlugin<Schemes, AreaExtra>,
    studioEvents: StudioEvents,
    /** Owner of the node paint order (#27); the save path reads `getOrder()`. */
    nodeOrder: NodeOrderKeeper<Schemes, Area2D<Schemes> | AreaExtra>,
    /** #36: snap modifier — prefer the settings store so rebinding is live. */
    snapModifier: () => string,
    /** #36: accumulate modifier — prefer the settings store so rebinding is live. */
    accumulateModifier: () => string,
    /** #36: fit all nodes in view. */
    fitView: () => Promise<void>
    /** #36: remove selected nodes, returning the count. */
    deleteSelectedNodes: () => Promise<number>
    /** #13: wrap the selected non-frame nodes in a new frame. Null when nothing is selected. */
    createFrameFromSelection: () => Promise<FrameNode | null>
    /** #13: flip a frame's collapsed state; descendants hide/show in place. */
    toggleFrameCollapsed: (frameId: string) => Promise<void>
    /** #14: Tab — enter the selected group instance, or exit one level. */
    toggleGroupEdit: () => Promise<string[]>
    /** #14: M — mute the selected nodes; returns how many changed. */
    toggleMuteSelected: () => Promise<number>
    /** #14: known group definitions, for placing another instance. */
    listGroupDefinitions: () => GroupDefinition[]
    /** #14: place another instance of a group definition. */
    addGroupInstance: (definitionId: string) => Promise<GroupNode | null>
    /** #14: wrap the selected non-frame nodes in a new group definition. */
    createGroupFromSelection: () => Promise<GroupNode | null>
    /** #14: boundary configuration for the group currently being edited. */
    getGroupBoundaryState: () => GroupBoundaryState | null
    /** #14: expose one member socket as a group input/output. */
    addGroupBoundarySocket: (direction: "input" | "output", nodeId: string, socketKey: string) => Promise<boolean>
    /** #14: rename or retype an existing group boundary socket. */
    updateGroupBoundarySocket: (socketId: string, patch: GroupSocketPatch, direction?: "input" | "output") => Promise<boolean>
    /** #14: remove a group boundary socket. */
    removeGroupBoundarySocket: (socketId: string, direction?: "input" | "output") => Promise<boolean>
    /** #36: apply live canvas preferences (grid visibility). */
    applyPreferences: (prefs: EditorPreferences) => void
    /** #8: create a node from a catalog entry. */
    addNodeFromCatalog: (entry: CatalogEntry, position?: { x: number; y: number }) => Promise<OnshapeNode | null>
    /** #73: create an array/iteration node by variant. */
    addArrayNode: (variant: ArrayNodeVariant, position?: { x: number; y: number }) => Promise<OnshapeNode | null>
    /** #73: create a math expression node. */
    addMathExpressionNode: (position?: { x: number; y: number }) => Promise<OnshapeNode | null>
    /** #73: create a curated utility node by id. */
    addUtilityNode: (utilityId: string, position?: { x: number; y: number }) => Promise<OnshapeNode | null>
    /** #6: the open graph as a serialized JSON document (schema v2). */
    serializeGraph: () => string
    /** #6: replace the editor's contents with a stored graph. */
    loadGraph: (reteJSON: string, resolveSpec: SpecResolver) => Promise<{ nodes: number; warnings: string[] }>
    /** #30: select a node by id; used by the design-check surface's Locate. */
    selectNode: (nodeId: string) => Promise<void>
    /**
     * #16: debug-grid sources for the #15 harness — one statement block per
     * non-frame node, and one selection per output socket.
     */
    debugSources: () => { nodes: DebugNodeSource[]; selections: DebugSelection[] }
}

export async function editorBase(container: HTMLElement): Promise<EditorBaseInfo> {
    const app = inject('app');
    if (app == null) {
        console.error('app could not be found');
    }
    reteAppInstance = app;

    const styleSettings = new StyleSettings();
    OnshapeSocket.setStyleSettings(styleSettings);

    const editor = new NodeEditor<Schemes>();
    const area = new AreaPlugin<Schemes, AreaExtra>(container);
    const connection = new CustomConnectionPlugin<Schemes, AreaExtra>(styleSettings);
    const vueRender = new VuePlugin<Schemes, AreaExtra>();

    vueRender.addPreset(
        VuePresets.classic.setup({
            customize: {
                node(context: any) {
                    if (context.payload instanceof FrameNode) {
                        return FrameNodeView;
                    }
                    if (context.payload instanceof MathExpressionNode) {
                        return MathExpressionNodeView;
                    }
                    if (context.payload instanceof OnshapeNode) {
                        return CustomFeatureComp;
                    }
                    return VuePresets.classic.Node;
                },
                socket() {
                    return OnshapeSocketComponent;
                },
                connection() {
                    return OutlineConnection;
                },
                control(data: ExtractPayload<Schemes, 'control'>) {
                    console.log(data);
                    const control = data.payload;
                    if (control instanceof OnshapeInputControl) {
                        return CustomControl;
                    }
                    console.warn('Invalid control not added', data);
                }
            },
            socketPositionWatcher: connection.socketPositionWatcher
        })
    );

    // const drag = new Drag({
    //     down: () => {
    //         if (TranslateLock.isLocked()) {
    //             return false;
    //         }
    //         return true;
    //     },
    //     move: () => {
    //         return true;
    //     }
    // });
    // area.area.setDragHandler(drag);

    area.addPipe((context) => {
        if (context.type === 'nodepicked' && TranslateLock.isLocked()) {
            return;
        }
        return context;
    })

    let snappedType: string;

    useConnectionSnapping(connection, area,
        (payload) => {
            if (payload['target']) {
                payload.sourceType = snappedType;
            } else {
                payload.targetType = snappedType;
            }
            payload.snapped = true;
        },
        (socket) => {
            snappedType = (socket as OnshapeSocketData).btType;
        }
    );

    connection.addPreset(() =>
        new ClassicFlow<Schemes, any[]>({
            makeConnection(from, to, context) {
                const [source, target] = getSourceTarget(from, to) || [null, null];
                const { editor } = context;

                if (source == null || target == null) {
                    return;
                }

                const sourceNode = editor.getNode(source.nodeId);

                const targetNode = editor.getNode(target.nodeId);

                if (sourceNode == null || targetNode == null) {
                    return;
                }

                if (source && target) {
                    editor.addConnection(
                        new Connection(
                            sourceNode,
                            source.key as never,
                            (source as OnshapeSocketData).btType,
                            targetNode,
                            target.key as never,
                            (target as OnshapeSocketData).btType,
                            styleSettings
                        )
                    );
                    return true;
                }
            }
        })
    );

    addCustomBackground(area);

    // #13 grouping v1: frames/scopes. The scopes plugin parents nodes into
    // frame nodes (`node.parent`, which OnshapeNode aliases to the serialized
    // `group`): drag a node onto a frame to group it, drag a frame to move
    // its contents with it, and it auto-fits the frame to its children. The
    // classic preset is its long-press-capture interaction.
    vueRender.addPreset(editorContextMenuPreset());

    // #8: canvas context menu ("Add node") listing the same catalog as the
    // palette, grouped by category. The plugin's factory adds the node at
    // the pointer, so placement is at the cursor.
    const contextMenu = new ContextMenuPlugin<Schemes>({
        items: ContextMenuPresets.classic.setup(
            groupByCategory(nodeableEntries(defaultCatalog.entries)).map(
                (group): [string, [string, () => OnshapeNode][]] => [
                    group.category,
                    group.entries.map((entry): [string, () => OnshapeNode] => [
                        entry.name,
                        () => createNodeFromCatalogEntry(entry, cachedSpecResolver) as OnshapeNode,
                    ]),
                ],
            ),
        ),
    });
    area.use(contextMenu);

    // Padding matches createFrameFromSelection (16px uniform) so the
    // scopes plugin's own refits (drag, remove) agree with the initial
    // measured fit instead of jumping to the plugin's 40/20 defaults.
    const scopes = new ScopesPlugin<Schemes>({
        padding: () => ({ top: FRAME_PADDING + FRAME_HEADER_HEIGHT, left: FRAME_PADDING, right: FRAME_PADDING, bottom: FRAME_PADDING }),
    });
    scopes.addPreset(ScopesPresets.classic.setup());

    editor.use(area);
    area.use(connection);
    area.use(vueRender);
    area.use(scopes);
    area.area.setZoomHandler(new Zoom(0.001) as any);

    // #13: the scopes plugin's own ordering moves a picked element to the
    // top of the holder, which would put a picked frame over its children
    // and over the connections. This pipe is registered after the plugin's,
    // so it runs after it and re-pins every frame element to its paint
    // layer — directly after the canvas background, at z-index -6 (below
    // the connection SVGs at -5, above the background at -10; see
    // frame-layout.ts). The order keeper (below) stacks regular nodes
    // (z-index auto/0, DOM last) on top of it.
    area.addPipe((context) => {
        const signal = context as { type?: string };
        if (signal.type === 'nodepicked' || signal.type === 'nodecreated') {
            const holder = area.area.content.holder;
            for (const node of editor.getNodes()) {
                if (!(node instanceof FrameNode)) {
                    continue;
                }
                const view = area.nodeViews.get(node.id);
                if (view != null && view.element.parentNode === holder) {
                    pinFrameElement(holder, view.element);
                }
            }
        }
        return context;
    });

    area.addPipe(context => {
        if (context.type === 'zoom' || context.type === 'zoomed') {
        }
        return context;
    })
    AreaExtensions.restrictor(area, {
        scaling: () => {
            return ({ min: 0.1, max: 2 })
        }
    });
    snapGrid(area, {
        size: () => editorSettings.getPreferences().snapGridSize,
        dynamic: true,
        allowed: () => {
            const prefs = editorSettings.getPreferences();
            return prefs.snapEnabled && checkKey(modifierCheckKey(prefs.snapModifier));
        }
    });

    area.addPipe(context => {
        if (context.type === 'nodetranslate' &&
            (ResizeController.isResizeActive() || TranslateLock.isLocked())) { return; }
        if (context.type === 'zoom' && context.data.source === 'dblclick') { return; }
        return context
    });

    TranslateLock.invert();

    editor.addPipe(context => {
        if (context.type === 'nodecreate') {
            const node = context.data;
            node.updateCallback = () => {
                area.update('node', node.id);
            }
            node['area'] = area;
        } else if (context.type === 'connectioncreate') {
            const data = context.data;

            if (data.source === data.target) {
                return;
            }

            const connectionIO = getConnectionIO(editor, data);
            if (connectionIO == undefined) return;
            const { source, target, output, input } = connectionIO

            // Typed-socket refusal (issue #9): a connection whose value
            // types have no coercion rule is refused here — returning
            // `undefined` cancels rete's `connectioncreate`, so
            // `editor.addConnection` returns false and nothing is wired.
            // The reason names both types.
            const sourceSocket = output.socket as OnshapeSocket | undefined;
            const targetSocket = input.socket as OnshapeSocket | undefined;
            if (
                sourceSocket != null &&
                targetSocket != null &&
                typeof sourceSocket.incompatibilityReason === 'function'
            ) {
                const reason = sourceSocket.incompatibilityReason(targetSocket);
                if (reason != null) {
                    console.warn(reason);
                    return;
                }
            }

            source.addConnection(output, input);
            target.addConnection(input, output);

            if (target instanceof OnshapeNode) {
                (target as OnshapeNode).updateVisibilities();
            }
        } else if (context.type === 'connectionremove') {
            const connectionIO = getConnectionIO(editor, context.data);
            if (connectionIO == undefined) return;
            const { source, target, output, input } = connectionIO

            source.removeConnection(output, input);
            target.removeConnection(input, output);

            if (target instanceof CustomFeatureNode) {
                (target as CustomFeatureNode).updateVisibilities();
            }
        }
        return context;
    });

    document.addEventListener('dragstart', ((e: DragEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation();
    }), {
        capture: true
    });

    const selector = new FixSelector();

    // Selected node's incident connections paint above other connections
    // (z-index -4 vs -5, still below nodes at 0 — see connection-raise.ts).
    // The views read the shared `selectedNodeIds` ref reactively, so the
    // only sync needed is publishing the selector's ids on every mutation.
    // `selectableNodes` mutates selection through `selector.add` (pick /
    // accumulate) and `selector.unselectAll` (background-click deselect);
    // wrapping those two instance methods sees every selection change,
    // including deselection back to empty, which emits no pipe signal.
    const connectionRaiseHooks = {
        getSelectedIds: () => Array.from(selector.entities.values())
            .filter((entity) => entity.label === 'node')
            .map((entity) => entity.id),
    };
    installConnectionRaise(area, connectionRaiseHooks);
    const syncRaise = (): void => syncConnectionRaise(connectionRaiseHooks);
    const originalSelectorAdd = selector.add.bind(selector);
    selector.add = async (...args: Parameters<typeof selector.add>): Promise<void> => {
        await originalSelectorAdd(...args);
        syncRaise();
    };
    const originalSelectorRemove = selector.remove.bind(selector);
    selector.remove = async (...args: Parameters<typeof selector.remove>): Promise<void> => {
        await originalSelectorRemove(...args);
        syncRaise();
    };
    const originalSelectorUnselectAll = selector.unselectAll.bind(selector);
    selector.unselectAll = async (): Promise<void> => {
        await originalSelectorUnselectAll();
        syncRaise();
    };

    AreaExtensions.selectableNodes(area, selector, {
        accumulating: {
            active: () => {
                return checkKey(modifierCheckKey(editorSettings.getPreferences().accumulateModifier));
            }
        }
    });

    // The node paint order (#27, DR-007) is owned here, by the canvas: one
    // explicit list of node ids, applied with `area.area.content.reorder`.
    // Do NOT also install `AreaExtensions.simpleNodesOrder` — it listens to
    // `nodepicked` and reorders the DOM itself, which would make it a second
    // owner of the order this app persists as `nodeOrder`.
    const nodeOrder = installNodeOrder(area, {
        getSelectedIds: connectionRaiseHooks.getSelectedIds,
        // #13: frames are excluded from the paint order entirely — the
        // pinning pipe above keeps their elements behind their children.
        isExcluded: (id) => editor.getNodes().find((node) => node.id === id) instanceof FrameNode,
    });

    // Frame sizing: the scopes plugin fits a frame from model
    // width/height, which go stale when rendered content grows (expanded
    // Definition/parameters overflow the fixed-height node box). Sync the
    // model from the rendered view and re-fit the parent frame on change.
    installFrameSizeSync({
        area: area as never,
        editor: editor as never,
        scopes: scopes as never,
        isFrame: (id) => editor.getNodes().find((node) => node.id === id) instanceof FrameNode,
    });


    // DataflowEngine listens for `nodecreated`, so it must be installed before
    // the editor gets any nodes (createEditor adds them after editorBase returns).
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);

    const buildStudio: () => Promise<string | undefined> = async () => generateFeatureStudioSource(editor, engine);
    const describeStudio = (): GeneratedFeatureDescription => describeGeneratedFeature(editor.getNodes());

    /**
     * #30: select a node by id, replacing the current selection. The design
     * check surface's "Locate" action uses this. Unknown ids are ignored.
     */
    const selectNode = async (id: string): Promise<void> => {
        const node = editor.getNode(id);
        if (node == null) {
            return;
        }
        // AreaExtensions.selectableNodes registered `selector` for the area;
        // adding to it is what a click does. `accumulate: false` replaces the
        // current selection rather than adding to it.
        await selector.add(node as unknown as Parameters<typeof selector.add>[0], false);
    };

    const fitView = async (): Promise<void> => {
        const nodes = editor.getNodes();
        if (nodes.length === 0) return;
        await AreaExtensions.zoomAt(area, nodes);
    };

    const deleteSelectedNodes = async (): Promise<number> => {
        const ids = Array.from(selector.entities.values())
            .filter((entity) => entity.label === 'node')
            .map((entity) => entity.id);
        const selectedNodes = ids
            .map((id) => editor.getNodes().find((node) => node.id === id))
            .filter((node): node is OnshapeNode => node != null);
        const selectedIds = new Set(selectedNodes.map((node) => node.id));

        // #13: the scopes plugin refuses to remove a frame that still has
        // children. Children that are not themselves being deleted are
        // ungrouped first; children that are, go first (below).
        for (const node of selectedNodes) {
            if (!(node instanceof FrameNode)) {
                continue;
            }
            for (const child of editor.getNodes()) {
                if (child.group === node.id && !selectedIds.has(child.id)) {
                    child.group = null;
                }
            }
        }

        let removed = 0;
        const ordered = [...selectedNodes].sort(
            (a, b) => Number(a instanceof FrameNode) - Number(b instanceof FrameNode)
        );
        for (const node of ordered) {
            if (await editor.removeNode(node.id)) removed++;
        }
        return removed;
    };

    // #13 frame helpers --------------------------------------------------
    //
    // Frame collapsing was removed. Frames always stay expanded, so no code
    // path here hides descendant node elements: old documents carrying
    // `collapsed: true` normalize to false in `FrameNode.fromJSON`, and
    // nothing else ever sets the flag. `toggleFrameCollapsed` is kept as a
    // no-op for API compatibility and only forces the expanded state.

    const toggleFrameCollapsed = async (frameId: string): Promise<void> => {
        const frame = editor.getNodes().find((node) => node.id === frameId);
        if (!(frame instanceof FrameNode)) {
            return;
        }
        // Collapse is disabled; the frame stays expanded with visible
        // descendants. Normalizing here covers legacy programmatic callers.
        frame.collapsed = false;
        const view = area.nodeViews.get(frame.id);
        if (view != null) {
            view.element.style.display = "";
        }
    };

    const createFrameFromSelection = async (): Promise<FrameNode | null> => {
        const selected = editor.getNodes().filter(
            (node) => node.selected && !(node instanceof FrameNode)
        );
        if (selected.length === 0) {
            return null;
        }

        // Measure the rendered views first: model width/height is stale
        // (220x150 default) until the node is laid out, and expanded
        // parameter content overflows the fixed-height box, so bounds
        // from the model come out ~20x80 / too short. Syncing the model
        // from the DOM also fixes the scopes plugin's later refits,
        // which read the same model fields.
        for (const node of selected) {
            syncNodeSize(node, area.nodeViews.get(node.id), areaZoom(area));
        }
        const boxes = selected.map((node) => {
            const position = area.nodeViews.get(node.id)?.position ?? { x: 0, y: 0 };
            return {
                left: position.x,
                top: position.y,
                right: position.x + node.width,
                bottom: position.y + node.height,
            };
        });
        const bounds = computeFrameBounds(boxes, FRAME_PADDING, FRAME_HEADER_HEIGHT);

        const frame = new FrameNode();
        frame.width = Math.max(frame.minWidth, bounds.width);
        frame.height = Math.max(80, bounds.height);
        await editor.addNode(frame);
        // The new element starts on top of the holder; pin it to its
        // paint layer behind its children and the connections (the
        // pinning pipe does this on later picks, but a fresh frame
        // needs it now).
        const holder = area.area.content.holder;
        const frameView = area.nodeViews.get(frame.id);
        if (frameView != null && frameView.element.parentNode === holder) {
            pinFrameElement(holder, frameView.element);
        }
        await area.translate(frame.id, { x: bounds.left, y: bounds.top });

        // Group after the frame exists and is positioned: the plugin's
        // validator requires the parent to be in the editor before a
        // grouped node is added, and assigning `group` is what the plugin
        // reads as `parent`.
        for (const node of selected) {
            node.group = frame.id;
        }
        // Re-fit through the scopes plugin (scopeupdated -> resizeParent)
        // so the frame's final size/position — and any parent frame's —
        // come from the same code path as drag-to-frame refits. The
        // measured bounds above already give the correct first paint.
        await scopes.update(frame.id);
        return frame;
    };

    const applyPreferences = (prefs: EditorPreferences): void => {
        applyCanvasPreferences(document, prefs);
    };
    applyPreferences(editorSettings.getPreferences());

    /**
     * #6: the open graph as one JSON document. Positions come from the
     * area plugin's node views (the canvas owns them); the paint order is
     * the canvas's, bottom-most first.
     */
    const serializeGraph = (): string => {
        const positions: Record<string, { x: number; y: number } | null> = {};
        for (const node of editor.getNodes()) {
            const view = area.nodeViews.get(node.id);
            positions[node.id] = view != null ? { ...view.position } : null;
        }
        return JSON.stringify(serializeEditorGraph(editor, positions, nodeOrder.getOrder()));
    };

    /**
     * #6: replace the editor's contents with a stored graph. The document
     * is fully validated before anything is removed, so a bad document
     * leaves the current graph untouched. Connections are added through
     * `editor.addConnection` so the `connectioncreate` pipe above teaches
     * the endpoints about each other — the serializer's `applyGraph`
     * helper does that explicitly because it is meant for headless
     * editors without the pipe, and doing both would register every
     * connection twice.
     */
    const loadGraph = async (reteJSON: string, resolveSpec: SpecResolver): Promise<{ nodes: number; warnings: string[] }> => {
        const result = deserializeGraphText(reteJSON, { resolveSpec });
        if (result.ok === false) {
            throw new Error(result.error);
        }
        const graph = result.graph;
        // #13: the scopes plugin refuses to remove a frame that still has
        // children, so existing non-frame nodes go first and frames last.
        for (const node of [...editor.getNodes()].sort(
            (a, b) => Number(a instanceof FrameNode) - Number(b instanceof FrameNode)
        )) {
            await editor.removeNode(node.id);
        }
        for (const node of graph.nodes) {
            await editor.addNode(node);
        }
        // Place nodes before creating their connections. rete-render-utils
        // snapshots socket centres when a connection is added; adding the
        // connections first left every restored wire at the node's
        // default/pre-translation position until a drag forced a re-render.
        for (const node of graph.nodes) {
            const position = graph.positions[node.id];
            if (position != null) {
                await area.translate(node.id, position);
            }
        }
        for (const connection of graph.connections) {
            await editor.addConnection(connection);
        }
        await nodeOrder.setOrder(graph.nodeOrder);
        // Serialized sizes are model sizes and can be stale against the
        // rendered views; sync them and let the scopes plugin re-fit
        // every loaded frame before first paint settles.
        for (const node of editor.getNodes()) {
            syncNodeSize(node, area.nodeViews.get(node.id), areaZoom(area));
        }
        for (const node of editor.getNodes()) {
            if (node instanceof FrameNode) {
                await scopes.update(node.id);
            }
        }
        // Repaint every restored connection from settled socket geometry
        // (node sizes, expanded controls and fonts can change after
        // addConnection). recalcAll emits the per-socket updates that the
        // connection views listen to; without it a restored wire can stay
        // offset until a node drag re-renders it.
        if (typeof document !== "undefined") {
            if (typeof requestAnimationFrame === "function") {
                await new Promise<void>((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                });
            }
            await connection.socketPositionWatcher.recalcAll();
        }
        // Old documents may carry collapsed frames; `FrameNode.fromJSON`
        // already normalized them to expanded, so descendants load visible.
        // #14: adopt the loaded definitions so instances can be re-placed
        // and entered without a reload.
        groupDefinitions.clear();
        for (const definition of graph.groupDefinitions) {
            groupDefinitions.set(definition.id, definition);
        }
        return {
            nodes: graph.nodes.filter((node) => !(node instanceof FrameNode)).length,
            warnings: graph.warnings,
        };
    };

    // #14 grouping v2: definitions, instances, editing mode, mute -------

    /** Known group definitions (loaded, or created from the selection). */
    const groupDefinitions = new Map<string, GroupDefinition>();
    let groupCounter = 0;

    const canvasPositions = (): Record<string, { x: number; y: number } | null> => {
        const positions: Record<string, { x: number; y: number } | null> = {};
        for (const node of editor.getNodes()) {
            const view = area.nodeViews.get(node.id);
            positions[node.id] = view != null ? { ...view.position } : null;
        }
        return positions;
    };

    /**
     * CustomFeature serialization stores only a spec reference. A group
     * snapshot/restore removes and re-adds those nodes, so carry the actual
     * specs alongside the snapshot; otherwise loadGraph cannot rebuild them
     * and exiting a group wipes the outer graph.
     */
    const collectSpecs = (): Record<string, unknown> => {
        const specs: Record<string, unknown> = {};
        const add = (node: OnshapeNode): void => {
            if (!(node instanceof CustomFeatureNode)) return;
            const spec = node.getFeatureSpec();
            const key = typeof spec?.featureType === 'string' ? spec.featureType : null;
            if (key != null) specs[key] = spec;
        };
        for (const node of editor.getNodes()) add(node);
        for (const definition of groupDefinitions.values()) {
            for (const node of definition.nodes) add(node);
        }
        return specs;
    };

    const groupController = new GroupEditorController(editor, {
        snapshot: () => ({ document: serializeGraph(), positions: canvasPositions(), specs: collectSpecs() }),
        restore: async (snap) => {
            await loadGraph(snap.document, (ref) => {
                const spec = snap.specs?.[ref.featureType];
                return spec as never;
            });
        },
        getPositions: () => canvasPositions(),
        setPositions: async (positions) => {
            for (const [id, position] of Object.entries(positions)) {
                if (position != null && editor.getNode(id) != null) {
                    await area.translate(id, position);
                }
            }
        },
        updateNode: async (nodeId) => {
            if (editor.getNode(nodeId) != null) {
                await area.update("node", nodeId);
            }
        },
    });

    const selectedInstanceId = (): string | undefined => {
        const selected = editor.getNodes().find((node) => node.selected && node instanceof GroupNode);
        return selected?.id;
    };

    const toggleGroupEdit = async (): Promise<string[]> => {
        await groupController.toggle(selectedInstanceId());
        return groupController.breadcrumb();
    };

    const getGroupBoundaryState = (): GroupBoundaryState | null => groupController.boundaryState();
    const addGroupBoundarySocket = (direction: "input" | "output", nodeId: string, socketKey: string): Promise<boolean> =>
        groupController.addBoundarySocket(direction, nodeId, socketKey);
    const updateGroupBoundarySocket = (socketId: string, patch: GroupSocketPatch, direction?: "input" | "output"): Promise<boolean> =>
        groupController.updateBoundarySocket(socketId, patch, direction);
    const removeGroupBoundarySocket = (socketId: string, direction?: "input" | "output"): Promise<boolean> =>
        groupController.removeBoundarySocket(socketId, direction);

    const toggleMuteSelected = async (): Promise<number> => {
        const selected = editor.getNodes().filter((node) => node.selected && !(node instanceof FrameNode));
        for (const node of selected) {
            node.muted = !node.muted;
        }
        return selected.length;
    };

    const listGroupDefinitions = (): GroupDefinition[] => [...groupDefinitions.values()];

    const addGroupInstance = async (definitionId: string): Promise<GroupNode | null> => {
        const definition = groupDefinitions.get(definitionId);
        if (definition == null) {
            return null;
        }
        const instance = new GroupNode(definition);
        const placed = await placeNode(instance);
        return placed as GroupNode | null;
    };

    const createGroupFromSelection = async (): Promise<GroupNode | null> => {
        const selected = editor.getNodes().filter(
            (node) => node.selected && !(node instanceof FrameNode),
        );
        if (selected.length === 0) {
            return null;
        }
        assertGroupableSelection(selected);
        const memberIds = new Set(selected.map((node) => node.id));
        const allConnections = editor.getConnections().map((connection) => ({
            source: connection.source,
            sourceOutput: connection.sourceOutput,
            target: connection.target,
            targetInput: connection.targetInput,
        }));
        const { inputs, outputs } = extractBoundarySockets(memberIds, allConnections, (nodeId, socketKey, direction) => {
            const node = editor.getNode(nodeId);
            const side = direction === "input" ? node?.inputs : node?.outputs;
            return (side?.[socketKey]?.socket as { valueType?: { name: string } } | undefined)?.valueType?.name;
        });

        const definition = createGroupDefinition(`group-${++groupCounter}`, `Group ${groupCounter}`);
        definition.nodes = [...selected];
        definition.connections = allConnections.filter(
            (connection) => memberIds.has(connection.source) && memberIds.has(connection.target),
        );
        definition.inputs = inputs;
        definition.outputs = outputs;
        definition.positions = canvasPositions();
        // A group created from nodes inside one frame stays inside that frame;
        // removing the members otherwise leaves an empty frame that the scopes
        // plugin shrinks to its header. Mixed-parent selections stay unparented.
        const parentFrame = commonGroupParent(selected);
        // A fresh definition cannot be part of a cycle, but a member that
        // is an instance of a definition that (transitively) contains one
        // of the selected nodes would be — refuse rather than build it.
        const definitions = new Map(groupDefinitions);
        definitions.set(definition.id, definition);
        for (const member of selected) {
            if (member instanceof GroupNode && wouldCreateGroupCycle(definitions, definition.id, member.definitionId)) {
                return null;
            }
        }
        groupDefinitions.set(definition.id, definition);

        const instance = new GroupNode(definition);
        instance.group = parentFrame;
        // External connections are rewired to the instance's boundary
        // sockets; the members leave the editor (they live in the
        // definition until the group is entered).
        const external = allConnections.filter(
            (connection) => memberIds.has(connection.source) !== memberIds.has(connection.target),
        );
        // Detach the members from their frames before removal. rete-scopes
        // refuses to remove a parent node that still has children; and an
        // empty frame would otherwise collapse to its header. The instance
        // inherits the shared parent frame below.
        for (const node of selected) {
            node.group = null;
        }
        for (const connection of [...editor.getConnections()]) {
            if (memberIds.has(connection.source) || memberIds.has(connection.target)) {
                await editor.removeConnection(connection.id);
            }
        }
        for (const node of [...selected]) {
            await editor.removeNode(node.id);
        }
        await editor.addNode(instance);
        const memberPositions = selected
            .map((node) => area.nodeViews.get(node.id)?.position ?? definition.positions[node.id])
            .filter((position): position is { x: number; y: number } => position != null);
        const centroid = memberPositions.length > 0
            ? {
                x: memberPositions.reduce((sum, position) => sum + position.x, 0) / memberPositions.length,
                y: memberPositions.reduce((sum, position) => sum + position.y, 0) / memberPositions.length,
            }
            : viewportCentre();
        await area.translate(instance.id, centroid);
        for (const connection of external) {
            if (memberIds.has(connection.target)) {
                const socketId = `${connection.target}.${connection.targetInput}`;
                if (instance.inputs[socketId] == null) continue;
                const sourceNode = editor.getNode(connection.source);
                if (sourceNode == null) continue;
                const rewired = new Connection(
                    sourceNode,
                    connection.sourceOutput,
                    sourceNode.outputs[connection.sourceOutput]?.socket.name ?? connection.sourceOutput,
                    instance,
                    socketId,
                    instance.inputs[socketId].socket.name,
                    styleSettings,
                );
                await editor.addConnection(rewired);
            } else {
                const socketId = `${connection.source}.${connection.sourceOutput}`;
                if (instance.outputs[socketId] == null) continue;
                const targetNode = editor.getNode(connection.target);
                if (targetNode == null) continue;
                const rewired = new Connection(
                    instance,
                    socketId,
                    instance.outputs[socketId].socket.name,
                    targetNode,
                    connection.targetInput,
                    targetNode.inputs[connection.targetInput]?.socket.name ?? connection.targetInput,
                    styleSettings,
                );
                await editor.addConnection(rewired);
            }
        }
        if (parentFrame != null) {
            // Re-fit the frame around the surviving group instance instead of
            // letting an empty scope collapse to its header.
            await scopes.update(parentFrame);
        }
        return instance;
    };

    // #8: last pointer position on the canvas, for palette placement.
    let lastPointer: { x: number; y: number } | null = null;
    container.addEventListener('pointerdown', (e) => {
        const t = (area.area as unknown as { transform?: { x: number; y: number; k: number } }).transform;
        const k = t?.k ?? 1;
        lastPointer = { x: (e.clientX - container.getBoundingClientRect().left - (t?.x ?? 0)) / k, y: (e.clientY - container.getBoundingClientRect().top - (t?.y ?? 0)) / k };
    });

    /** #8: viewport centre in canvas coordinates (keyboard placement). */
    const viewportCentre = (): { x: number; y: number } => {
        const t = (area.area as unknown as { transform?: { x: number; y: number; k: number } }).transform;
        const k = t?.k ?? 1;
        return { x: (container.clientWidth / 2 - (t?.x ?? 0)) / k, y: (container.clientHeight / 2 - (t?.y ?? 0)) / k };
    };

    /** #73: place a node at the given / last-click / centre position, clamped into view. */
    const getTransform = (): { x: number; y: number; k: number } => {
        const t = (area.area as unknown as { transform?: { x: number; y: number; k: number } }).transform;
        return { x: t?.x ?? 0, y: t?.y ?? 0, k: t?.k ?? 1 };
    };

    /** Screen px at the bottom of the container covered by the Build Log / bottom bar. */
    const reservedBottomPx = (): number => {
        try {
            const containerRect = container.getBoundingClientRect();
            let reserved = 0;
            for (const selector of ['.log-panel', '#bottom-bar']) {
                const el = document.querySelector(selector);
                if (el != null) {
                    const rect = el.getBoundingClientRect();
                    reserved = Math.max(reserved, containerRect.bottom - rect.top);
                }
            }
            return Math.max(0, Math.min(reserved, containerRect.height * 0.6));
        } catch {
            return 0;
        }
    };

    const nextFrame = (): Promise<void> => new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 50);
        }
    });

    const placeNode = async (node: OnshapeNode | null, position?: { x: number; y: number }): Promise<OnshapeNode | null> => {
        if (node == null) return null;
        let desired = position ?? lastPointer ?? viewportCentre();
        // A pointer-derived position in the bottom reserved strip would bury
        // the node under the Build Log: prefer the canvas centre instead.
        // Explicit positions are honoured unless clipped (clamped below).
        if (position == null) {
            const t = getTransform();
            const screenY = desired.y * t.k + t.y;
            if (screenY > container.clientHeight - reservedBottomPx()) {
                desired = viewportCentre();
            }
        }
        await editor.addNode(node);
        await area.translate(node.id, desired);
        // Measure the rendered node (expanded Definition included) before
        // clamping; the model size is the stale 220x150 default until synced.
        await nextFrame();
        syncNodeSize(node, area.nodeViews.get(node.id), areaZoom(area));
        await nextFrame();
        syncNodeSize(node, area.nodeViews.get(node.id), areaZoom(area));
        const clamped = clampNodePlacement({
            desired,
            size: { width: node.width, height: node.height },
            transform: getTransform(),
            containerRect: { width: container.clientWidth, height: container.clientHeight },
            reservedBottom: reservedBottomPx(),
            margin: 12,
        });
        if (Math.abs(clamped.x - desired.x) > 0.5 || Math.abs(clamped.y - desired.y) > 0.5) {
            await area.translate(node.id, clamped);
        }
        return node;
    };

    /** #8: create a catalog node and place it at the given / last-click / centre position. */
    const addNodeFromCatalog = async (entry: CatalogEntry, position?: { x: number; y: number }): Promise<OnshapeNode | null> =>
        placeNode(createNodeFromCatalogEntry(entry, cachedSpecResolver), position);

    /** #73: array/iteration nodes the catalog does not contain. */
    const addArrayNode = async (variant: ArrayNodeVariant, position?: { x: number; y: number }): Promise<OnshapeNode | null> =>
        placeNode(createArrayNode(variant), position);

    /** #73: a free-form math expression node. */
    const addMathExpressionNode = async (position?: { x: number; y: number }): Promise<OnshapeNode | null> =>
        placeNode(createMathExpressionNode(), position);

    /** #73: a curated utility node by id. */
    const addUtilityNode = async (utilityId: string, position?: { x: number; y: number }): Promise<OnshapeNode | null> =>
        placeNode(createUtilityNode(utilityId), position);

    /**
     * #16: debug-grid sources for the #15 harness. One statement block per
     * non-frame node (its own FeatureScript line) under a camelized unique
     * variable, and one selection per output socket. Expression/value nodes
     * contribute their hoisted `let` binding via the same line channel — the
     * harness tolerates nodes whose statements are not standalone; the grid
     * surfaces the server's attribution instead of guessing.
     */
    const debugSources = (): { nodes: DebugNodeSource[]; selections: DebugSelection[] } => {
        const nodes: DebugNodeSource[] = [];
        const selections: DebugSelection[] = [];
        const usedVariables = new Set<string>();
        for (const node of editor.getNodes()) {
            if (node instanceof FrameNode) continue;
            let variable = camelize(node.id).replace(/[^A-Za-z0-9_]/g, '_');
            if (variable === '' || /^[0-9]/.test(variable)) variable = `n${variable}`;
            const base = variable;
            let suffix = 1;
            while (usedVariables.has(variable)) variable = `${base}${suffix++}`;
            usedVariables.add(variable);
            let statements: string[] = [];
            try {
                const info = node.getFeatureScriptInfo({});
                if (typeof info?.line === 'string' && info.line.trim() !== '') statements = [info.line];
            } catch {
                statements = [];
            }
            nodes.push({ nodeId: node.id, variable, statements });
            for (const socket of Object.keys(node.outputs ?? {})) {
                selections.push({ nodeId: node.id, socket });
            }
        }
        return { nodes, selections };
    };

    return {
        editor,
        area,
        connection,
        nodeOrder,
        snapModifier: () => editorSettings.getPreferences().snapModifier,
        accumulateModifier: () => editorSettings.getPreferences().accumulateModifier,
        fitView,
        deleteSelectedNodes,
        createFrameFromSelection,
        toggleFrameCollapsed,
        toggleGroupEdit,
        toggleMuteSelected,
        listGroupDefinitions,
        addGroupInstance,
        createGroupFromSelection,
        getGroupBoundaryState,
        addGroupBoundarySocket,
        updateGroupBoundarySocket,
        removeGroupBoundarySocket,
        applyPreferences,
        addNodeFromCatalog,
        addArrayNode,
        addMathExpressionNode,
        addUtilityNode,
        serializeGraph,
        loadGraph,
        studioEvents: { build: buildStudio, describe: describeStudio },
        debugSources,
        selectNode
    }
}