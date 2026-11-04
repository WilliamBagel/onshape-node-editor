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

    editor.use(area);
    area.use(connection);
    area.use(vueRender);
    area.area.setZoomHandler(new Zoom(0.001) as any);

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
            .map((entity) => entity.id)
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
        let removed = 0;
        for (const id of ids) {
            if (editor.getNode(id) != null && await editor.removeNode(id)) removed++;
        }
        return removed;
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
        for (const node of [...editor.getNodes()]) {
            await editor.removeNode(node.id);
        }
        for (const node of graph.nodes) {
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
        return { nodes: graph.nodes.length, warnings: graph.warnings };
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
        applyPreferences,
        serializeGraph,
        loadGraph,
        studioEvents: { build: buildStudio, describe: describeStudio },
        selectNode
    }
}