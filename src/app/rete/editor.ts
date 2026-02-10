import { ClassicPreset } from 'rete';

import { CustomFeatureNode } from './nodes/customfeaturenode';
import { inject } from 'vue';
import { editorBase } from './editorbase';
import { Connection } from './types';
import { StyleSettings } from './stylesettings';

const socket = new ClassicPreset.Socket('socket');

export async function createEditor(container: HTMLElement) {
  const app = inject('app');
  if (app == null) {
    console.error('app could not be found');
  }

  const { editor, area, connection } = await editorBase(container);


  const aType = 'Mirror';
  const bType = 'Something';

  const a = new CustomFeatureNode({ featureTypeName: aType });
  a.addOutput('a', new ClassicPreset.Output(socket, 'label1'));
  a.addInput('a', new ClassicPreset.Input(socket, 'label2'));
  await editor.addNode(a);

  const b = new CustomFeatureNode({ featureTypeName: bType });
  b.addOutput('a', new ClassicPreset.Output(socket, 'label3'));
  b.addInput('a', new ClassicPreset.Input(socket, 'label4'));
  await editor.addNode(b);

  await area.translate(a.id, { x: 0, y: 0 });
  await area.translate(b.id, { x: 300, y: 0 });

  // await editor.addConnection(new Connection(a, 'a', a.inputs['a'].socket.name, b, 'a', b.inputs['a'].socket.name, new StyleSettings()));

  return {
    destroy: () => area.destroy(),
  };
}

