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
import { ScopesPlugin, Presets as ScopesPresets } from 'rete-scopes-plugin';
import { DataflowEngine } from 'rete-engine';
import { FixSelector } from './modified-rete/fixselector';
import { installNodeOrder, NodeOrderKeeper } from './modified-rete/nodeorder';
import { generateFeatureStudioSource, describeGeneratedFeature, GeneratedFeatureDescription } from "./graph-codegen";
import { deserializeGraphText, serializeGraph as serializeEditorGraph } from "./serialization/graph-serializer";
import type { SpecResolver } from "./serialization/graph-schema-types";
import { editorSettings, applyCanvasPreferences, type EditorPreferences } from "../ui/editorSettings";

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
    /** #36: apply live canvas preferences (grid visibility) without a reload. */
    applyPreferences: (prefs: EditorPreferences) => void
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
    /** #36: apply live canvas preferences (grid visibility). */
    applyPreferences: (prefs: EditorPreferences) => void
    /** #6: the open graph as a serialized JSON document (schema v2). */
    serializeGraph: () => string
    /** #6: replace the editor's contents with a stored graph. */
    loadGraph: (reteJSON: string, resolveSpec: SpecResolver) => Promise<{ nodes: number; warnings: string[] }>
    /** #30: select a node by id; used by the design-check surface's Locate. */
    selectNode: (nodeId: string) => Promise<void>
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
    const scopes = new ScopesPlugin<Schemes>();
    scopes.addPreset(ScopesPresets.classic.setup());

    editor.use(area);
    area.use(connection);
    area.use(vueRender);
    area.use(scopes);
    area.area.setZoomHandler(new Zoom(0.001) as any);

    // #13: the scopes plugin's own ordering moves a picked element to the
    // top of the holder, which would put a picked frame over its children.
    // This pipe is registered after the plugin's, so it runs after it and
    // re-pins every frame element to the front of the holder; the order
    // keeper (below) stacks the regular nodes on top of it.
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
                    holder.insertBefore(view.element, holder.firstChild);
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
        getSelectedIds: () => Array.from(selector.entities.values())
            .filter((entity) => entity.label === 'node')
            .map((entity) => entity.id),
        // #13: frames are excluded from the paint order entirely — the
        // pinning pipe above keeps their elements behind their children.
        isExcluded: (id) => editor.getNodes().find((node) => node.id === id) instanceof FrameNode,
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

    /** True when any frame above `node` in the group chain is collapsed. */
    const isEffectivelyHidden = (node: OnshapeNode): boolean => {
        let parentId = node.group;
        const seen = new Set<string>();
        while (parentId != null && !seen.has(parentId)) {
            seen.add(parentId);
            const parent = editor.getNodes().find((candidate) => candidate.id === parentId);
            if (parent instanceof FrameNode && parent.collapsed) {
                return true;
            }
            parentId = parent?.group ?? null;
        }
        return false;
    };

    /** Recompute every node's visibility from the frames' collapsed flags. */
    const applyCollapsedStates = (): void => {
        for (const node of editor.getNodes()) {
            const view = area.nodeViews.get(node.id);
            if (view != null) {
                view.element.style.display = isEffectivelyHidden(node) ? 'none' : '';
            }
        }
    };

    /** Wire a frame's view toggle to the canvas (the view only flips the flag). */
    const prepareFrame = (frame: FrameNode): void => {
        frame.onCollapsedChanged = () => {
            applyCollapsedStates();
        };
    };

    const toggleFrameCollapsed = async (frameId: string): Promise<void> => {
        const frame = editor.getNodes().find((node) => node.id === frameId);
        if (!(frame instanceof FrameNode)) {
            return;
        }
        frame.collapsed = !frame.collapsed;
        applyCollapsedStates();
    };

    const createFrameFromSelection = async (): Promise<FrameNode | null> => {
        const selected = editor.getNodes().filter(
            (node) => node.selected && !(node instanceof FrameNode)
        );
        if (selected.length === 0) {
            return null;
        }

        const padding = 16;
        const boxes = selected.map((node) => {
            const position = area.nodeViews.get(node.id)?.position ?? { x: 0, y: 0 };
            return {
                left: position.x,
                top: position.y,
                right: position.x + node.width,
                bottom: position.y + node.height,
            };
        });
        const left = Math.min(...boxes.map((box) => box.left)) - padding;
        const top = Math.min(...boxes.map((box) => box.top)) - padding;
        const right = Math.max(...boxes.map((box) => box.right)) + padding;
        const bottom = Math.max(...boxes.map((box) => box.bottom)) + padding;

        const frame = new FrameNode();
        frame.width = Math.max(frame.minWidth, right - left);
        frame.height = Math.max(80, bottom - top);
        prepareFrame(frame);
        await editor.addNode(frame);
        // The new element starts on top of the holder; pin it behind its
        // children (the pinning pipe does this on later picks, but a fresh
        // frame needs it now).
        const holder = area.area.content.holder;
        const frameView = area.nodeViews.get(frame.id);
        if (frameView != null && frameView.element.parentNode === holder) {
            holder.insertBefore(frameView.element, holder.firstChild);
        }
        await area.translate(frame.id, { x: left, y: top });

        // Group after the frame exists and is positioned: the plugin's
        // validator requires the parent to be in the editor before a
        // grouped node is added, and assigning `group` is what the plugin
        // reads as `parent`.
        for (const node of selected) {
            node.group = frame.id;
        }
        applyCollapsedStates();
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
            if (node instanceof FrameNode) {
                prepareFrame(node);
            }
            await editor.addNode(node);
        }
        for (const connection of graph.connections) {
            await editor.addConnection(connection);
        }
        for (const node of graph.nodes) {
            const position = graph.positions[node.id];
            if (position != null) {
                await area.translate(node.id, position);
            }
        }
        await nodeOrder.setOrder(graph.nodeOrder);
        // Restore collapsed frames after positions exist so hidden children
        // hide in place rather than flashing on load.
        applyCollapsedStates();
        return {
            nodes: graph.nodes.filter((node) => !(node instanceof FrameNode)).length,
            warnings: graph.warnings,
        };
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
        applyPreferences,
        serializeGraph,
        loadGraph,
        studioEvents: { build: buildStudio, describe: describeStudio },
        selectNode
    }
}