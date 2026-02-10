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


import CustomFeatureComp from '../customization/FeatureNode.vue';
import OutlineConnection from '../customization/OutlineConnection.vue';
import { ExtractPayload } from "rete-vue-plugin/_types/presets/classic/types";
import CustomControl from "../customization/controls/QuantityControl.vue";
import { OnshapeInputControl } from "./controls/onshapeinputcontrol";
import { Zoom } from "./modified-rete/improvedzoom";
import OnshapeSocketComponent from "../customization/OnshapeSocket.vue";
import { OnshapeSocket} from "./onshapesockets";
import { TranslateLock } from "../utils/translatelock";
import { getConnectionIO, getConnectionNodes } from "./utils";
import { CustomFeatureNode } from "./nodes/customfeaturenode";
import { snapGrid } from "./modified-rete/areasnap";
import { StyleSettings } from "./stylesettings";
import { CustomConnectionPlugin } from "./customconnectionplugin";
// import { accumulateOnCtrl, MySelector, selectableNodes } from "./testselector";

type EditorBaseInfo = {
    editor: NodeEditor<Schemes>,
    area: AreaPlugin<Schemes, AreaExtra>,
    connection: ConnectionSnappingPlugin<Schemes, AreaExtra>
}

export async function editorBase(container: HTMLElement): Promise<EditorBaseInfo> {

    const styleSettings = new StyleSettings();
    OnshapeSocket.setStyleSettings(styleSettings);

    const editor = new NodeEditor<Schemes>();
    const area = new AreaPlugin<Schemes, AreaExtra>(container);
    const connection = new CustomConnectionPlugin<Schemes, AreaExtra>(styleSettings);
    const vueRender = new VuePlugin<Schemes, AreaExtra>();

    vueRender.addPreset(
        VuePresets.classic.setup({
            customize: {
                node(context) {
                    if (context.payload.type === 'CustomFeature') {
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

                if (source && target) {
                    editor.addConnection(
                        new Connection(
                            editor.getNode(source.nodeId),
                            source.key as never,
                            (source as OnshapeSocketData).btType,
                            editor.getNode(target.nodeId),
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

            const { source, target, output, input } = getConnectionIO(editor, data);

            source.addConnection(output, input);
            target.addConnection(input, output);

            if (target instanceof CustomFeatureNode) {
                (target as CustomFeatureNode).updateVisibilities();
            }

            //  console.log()
            // } else if (context.type === 'connectioncreated'){
            //     console.log(context,editor);
            // } else if (context.type === 'connectionremoved'){
            //     console.log(context,editor);
        } else if (context.type === 'connectionremove') {
            const { source, target, output, input } = getConnectionIO(editor, context.data);

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

    const selector = AreaExtensions.selector();

    AreaExtensions.selectableNodes(area, selector, {
        accumulating: {
            active: () => {
                return checkKey('Shift');
            }
        }
    });

    return {
        editor,
        area,
        connection
    }
}