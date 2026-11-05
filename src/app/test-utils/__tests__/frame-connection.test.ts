/**
 * Frame collapse removal + selected-node connection raise (jsdom, fast).
 * Run with: pnpm run test:ui
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import FrameNodeView from '../../customization/FrameNodeView.vue';
import OutlineConnection from '../../customization/OutlineConnection.vue';
import { FrameNode } from '../../rete/nodes/framenode';
import { CONNECTION_RAISED_CLASS, setSelectedNodeIds } from '../../rete/modified-rete/connection-raise';

afterEach(() => {
  setSelectedNodeIds([]);
  document.body.innerHTML = '';
});

function connectionData(source: string, target: string, id: string) {
  return {
    id,
    source,
    target,
    sourceOutput: 'out',
    targetInput: 'in',
    sourceType: '',
    targetType: '',
    snapped: false,
    styleSettings: undefined,
  };
}

describe('frame view: no collapse affordance', () => {
  it('renders no toggle and no collapsed body; frames stay expanded', () => {
    const frame = new FrameNode('Finishing');
    expect(frame.collapsed).toBe(false);
    const wrapper = mount(FrameNodeView, { props: { data: frame, width: 320, height: 200 } });
    expect(wrapper.find('.frame-toggle').exists()).toBe(false);
    expect(wrapper.find('.frame-body').exists()).toBe(false);
    expect(wrapper.classes()).not.toContain('collapsed');
    expect(wrapper.find('.frame-title').text()).toBe('Finishing');
    wrapper.unmount();
  });
});

describe('connection view: selected-node raise class', () => {
  it('applies connection-node-selected only to incident connections, then clears it', async () => {
    const incident = mount(OutlineConnection, {
      props: { data: connectionData('n1', 'n2', 'c1'), start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, path: 'M0 0 L10 0' },
    });
    const unrelated = mount(OutlineConnection, {
      props: { data: connectionData('n3', 'n4', 'c2'), start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, path: 'M0 0 L10 0' },
    });
    expect(incident.classes()).not.toContain(CONNECTION_RAISED_CLASS);
    expect(unrelated.classes()).not.toContain(CONNECTION_RAISED_CLASS);

    setSelectedNodeIds(['n1']);
    await nextTick();
    expect(incident.classes()).toContain(CONNECTION_RAISED_CLASS);
    expect(unrelated.classes()).not.toContain(CONNECTION_RAISED_CLASS);

    // Deselect (empty selection): the boost must clear.
    setSelectedNodeIds([]);
    await nextTick();
    expect(incident.classes()).not.toContain(CONNECTION_RAISED_CLASS);
    incident.unmount();
    unrelated.unmount();
  });
});
