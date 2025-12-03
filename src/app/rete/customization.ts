import { NodeEditor, ClassicPreset } from 'rete';

import { AreaPlugin } from 'rete-area-plugin';
import {
  Presets as ConnectionPresets
} from 'rete-connection-plugin';

import {
  VuePlugin, Presets as VuePresets
} from 'rete-vue-plugin';

import CustomFeatureComp from '../customization/CustomFeature.vue';
import CustomConnection from '../customization/CustomConnection.vue';
import CustomSocket from '../customization/CustomSocket.vue';

import { addCustomBackground } from '../customization/custom-background';
import { ResizeController } from '../utils/resizecontroller';
import { ConnectionSnappingPlugin, useConnectionSnapping } from './connection-snapping/connectionsnapping';
import { AreaExtra, Schemes } from './types';
import { CustomFeatureNode } from './nodes/customfeaturenode';

const socket = new ClassicPreset.Socket('socket');

export async function createEditor(container: HTMLElement) {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
  const connection = new ConnectionSnappingPlugin<Schemes, AreaExtra>();

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
          return CustomSocket;
        },
        connection() {
          return CustomConnection;
        },
      },
      socketPositionWatcher: connection.socketPositionWatcher
    })
  );

  useConnectionSnapping(connection, area);

  connection.addPreset(ConnectionPresets.classic.setup());

  addCustomBackground(area);

  editor.use(area);
  area.use(connection);

  area.use(vueRender);

  area.addPipe(context => {
    if (context.type === 'nodetranslate' && ResizeController.isResizeActive()) { return; }
    if (context.type === 'zoom' && context.data.source === 'dblclick') { return; }

    return context
  })

  editor.addPipe(context => {
    if (context.type === 'nodecreate') {
      const node = context.data;
      node.updateCallback = () => {
        area.update('node', node.id);
      }
      node['area'] = area;
    }
    return context;
  })

  const aType = 'Mirror';
  const bType = 'Something';

  const a = new CustomFeatureNode(aType);
  a.addOutput('a', new ClassicPreset.Output(socket, 'label1'));
  a.addInput('a', new ClassicPreset.Input(socket, 'label2'));
  await editor.addNode(a);

  const b = new CustomFeatureNode(bType);
  b.addOutput('a', new ClassicPreset.Output(socket, 'label3'));
  b.addInput('a', new ClassicPreset.Input(socket, 'label4'));
  await editor.addNode(b);

  await area.translate(a.id, { x: 0, y: 0 });
  await area.translate(b.id, { x: 300, y: 0 });

  await editor.addConnection(new ClassicPreset.Connection(a, 'a', b, 'a'));

  return {
    destroy: () => area.destroy(),
  };
}

