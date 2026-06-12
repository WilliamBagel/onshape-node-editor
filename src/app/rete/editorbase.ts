import { inject } from 'vue';
import { NodeEditor } from "rete";
import { AreaExtensions, AreaPlugin, Drag } from "rete-area-plugin";
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
import { OnshapeNode, TopLevelVariableDefintion, VariablePointer } from "./nodes/onshapenode";
import { DataflowEngine } from 'rete-engine';
import { FixSelector } from './modified-rete/fixselector';
import { ReteOnshapeNodeProcessor } from './rete-onshape-nodeprocessor';
import { FeatureStudioGenerator, NodeFeaturescriptInfo } from '../onshape-utils/featurestudiogenerator';
// import { accumulateOnCtrl, MySelector, selectableNodes } from "./testselector";

// Module-level app reference for access from Rete components
export let reteAppInstance: any = null;

export type StudioEvents = {
    build: () => Promise<string | undefined>;
}

export type EditorControls = {
    studioEvents: StudioEvents
    destroy: () => void;
}

type EditorBaseInfo = {
    editor: NodeEditor<Schemes>,
    area: AreaPlugin<Schemes, AreaExtra>,
    connection: ConnectionSnappingPlugin<Schemes, AreaExtra>,
    studioEvents: StudioEvents
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
        size: 20,
        dynamic: true,
        allowed: () => {
            return checkKey('control');
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
                return checkKey('Shift');
            }
        }
    });


    /**
     * Modified by Claude 4.5 Haiku
     */
    // TODO move this is another file
    const engine = new DataflowEngine<Schemes>();
    editor.use(engine);

    const buildStudio: () => Promise<string | undefined> = async () => {
        const nodeProcessor = new ReteOnshapeNodeProcessor(editor);
        const nodeArray = nodeProcessor.processNodes();

        if (!nodeArray) {
            console.warn('No nodes to process');
            return;
        }

        // Track local variables: {variableName: {nodeId: actualVariableName}}
        const localVariableIdentifiers: Record<string, Record<string, string>> = {};

        // // Maps nodeId to a record of output names to their actual variable names
        // const nodeOutputVariables: Record<string, Record<string, string>> = {};

        // Helper function to populate a unique variable name
        const createLocalVariableIndentifier = (desired: string, nodeId: string): string => {
            let identifier = desired;
            let counter = 0;

            // Check if this name already exists
            if (!localVariableIdentifiers[desired]) {
                localVariableIdentifiers[desired] = {};
            }

            // Check if identifier already exists
            if (localVariableIdentifiers[desired][nodeId]) {
                return localVariableIdentifiers[desired][nodeId]
            }

            // If the preferred name is taken, append a counter
            while (Object.values(localVariableIdentifiers[desired]).includes(identifier)) {
                identifier = `${desired}${counter}`;
                counter++;
            }

            // Store the mapping
            localVariableIdentifiers[desired][nodeId] = identifier;

            // // Track which output produced this variable
            // if (!nodeOutputVariables[nodeId]) {
            //     nodeOutputVariables[nodeId] = {};
            // }
            // nodeOutputVariables[nodeId][outputKey] = identifier;

            return identifier;
        };

        // map of consumer node id to map of input key and pointer to producer
        const nodeDataMap: Record<string, Record<string, VariablePointer>[]> = {};

        // map of consumer node id to map of input key and assigned identifier
        const topLevelVariablesMap: Record<string, Record<string, TopLevelVariableDefintion>> = {};

        // First pass: fetch data for all nodes and assign variable names to their outputs
        for (const nodeId of nodeArray) {
            const node = editor.getNode(nodeId);
            if (node == null) {
                console.warn(`Could not find node with id ${nodeId}`);
                continue;
            }

            // Fetch the node's inputs 
            // Returns a Record<string, VariablePointer> for inputs to the node
            const nodeInputs = await engine.fetchInputs(nodeId);
            if (!(nodeInputs && typeof nodeInputs === 'object')) {
                console.warn(`Node ${nodeId} did not return valid data`);
                continue;
            }
            nodeDataMap[nodeId] = nodeInputs as Record<string, VariablePointer>[];

            // handle any top level variables the node declares and defines
            const topLevelVariables = node.getTopLevelVariables();
            const tLVEntries = Object.entries(topLevelVariables);
            if (tLVEntries.length > 0) {
                const tLVDefinitions: Record<string, TopLevelVariableDefintion> = {};

                for (const [symbol, featurescript] of tLVEntries) {
                    const identifier = createLocalVariableIndentifier(symbol, nodeId);
                    tLVDefinitions[symbol] = { identifier, featurescript };
                }
                topLevelVariablesMap[nodeId] = tLVDefinitions;
            }


            // Iterate over each output that defines a variable
            const nodeVariables = node.getVariableSymbols();
            for (const key of nodeVariables) {
                // Assign a unique variable name for this output
                const actualName = createLocalVariableIndentifier(key, nodeId);
                console.log(`Node ${nodeId} output '${key}' assigned variable name: ${actualName}`);
            }

        }

        // Second pass: build variable mappings for each node's inputs and generate featurescript representation
        const featureScriptInfo: NodeFeaturescriptInfo[] = [];

        for (const nodeId of nodeArray) {
            const node = editor.getNode(nodeId);
            if (node == null) {
                continue;
            }

            // Build the variable mapping for this node's inputs
            const variableMapping: Record<string, string> = {};

            // node data is currently the input to the node
            // need to check if node wants other variables like a default query
            // so join this with that array
            const nodeData = nodeDataMap[nodeId];
            for (const key in nodeData) {
                const variablePointer = nodeData[key]?.[0];
                // Look up the variable name from the source node's output
                const localVariableUsages = localVariableIdentifiers[variablePointer.name];
                if (localVariableUsages && localVariableUsages[variablePointer.id]) {
                    // set variable name to unique identifier
                    variableMapping[key] = localVariableUsages[variablePointer.id];
                } else {
                    console.warn(`Could not find ${variablePointer.name} and ${variablePointer.id} in indentifiers:`, localVariableIdentifiers);
                }
            }

            // add top level variables' identifiers to variableMapping, for the consumers 
            const tLVDefinitions = topLevelVariablesMap[nodeId];
            if (tLVDefinitions != null) {
                for (const [key, value] of Object.entries(tLVDefinitions)) {
                    variableMapping[key] = value.identifier;
                }
            }
            // Get the feature script info with the variable mapping
            // if (typeof node.getFeatureScriptInfo === 'function') {
            const info = node.getFeatureScriptInfo(variableMapping);
            featureScriptInfo.push(info);
            console.log(`Generated feature script for node ${nodeId}:`, node);
            // }
            if (node.type === 'define-feature') {
                // add top level variables after define feature
                for (const TopLevelVariableDefintion of Object.values(topLevelVariablesMap)) {
                    for (const value of Object.values(TopLevelVariableDefintion)) {
                        featureScriptInfo.push({
                            line: `var ${value.identifier} = ${value.featurescript};`,
                            dependencies: [{path: "onshape/std/query.fs", version: "2770.0"}]
                        })
                    }
                }
            }
        }

        console.log('Final featureScriptInfo array:', featureScriptInfo);

        const featureStudioGenerator = new FeatureStudioGenerator();

        return featureStudioGenerator.generateFeatureStudioCode(featureScriptInfo);
    }

    return {
        editor,
        area,
        connection,
        studioEvents: { build: buildStudio }
    }
}