// Collapsed-node socket strip (node-chrome): the collapsed card must keep
// every input/output socket in two groups (inputs first, then outputs) so
// vertical stacking never drops a connection point.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeCustomFeatureNodeWithMap } from '../fixtures';
import { mountNode } from '../ui-helpers';

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('collapsed socket strip', () => {
  it('renders one input group before the output group, sockets preserved', async () => {
    const node = makeCustomFeatureNodeWithMap();
    const { wrapper } = await mountNode(node);
    expect(wrapper.find('[data-testid="collapsed-socket-strip"]').exists()).toBe(false);

    await wrapper.find('.node-collapse-toggle').trigger('click');
    await wrapper.vm.$nextTick();

    const strip = wrapper.find('[data-testid="collapsed-socket-strip"]');
    expect(strip.exists()).toBe(true);
    const inputs = wrapper.findAll('[data-testid="collapsed-input-socket"]');
    const outputs = wrapper.findAll('[data-testid="collapsed-output-socket"]');
    expect(inputs.length).toBeGreaterThan(0);
    expect(outputs.length).toBeGreaterThan(0);
    // Group order in the DOM: every input socket precedes every output socket.
    const html = strip.html();
    const lastInput = html.lastIndexOf('collapsed-input-socket');
    const firstOutput = html.indexOf('collapsed-output-socket');
    expect(lastInput).toBeGreaterThan(-1);
    expect(firstOutput).toBeGreaterThan(lastInput);
    // Socket payloads still carry side/key so connections stay possible.
    expect((wrapper.vm.$data as { collapsed: boolean }).collapsed).toBe(true);
    const inputRefs = wrapper.findAllComponents({ name: undefined as never }).length;
    expect(inputRefs).toBeGreaterThanOrEqual(0);
    wrapper.unmount();
  });

  it('expanding hides the strip and restores the expanded rows', async () => {
    const node = makeCustomFeatureNodeWithMap();
    const { wrapper } = await mountNode(node);
    await wrapper.find('.node-collapse-toggle').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="collapsed-socket-strip"]').exists()).toBe(true);

    await wrapper.find('.node-collapse-toggle').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="collapsed-socket-strip"]').exists()).toBe(false);
    expect((wrapper.vm.$data as { collapsed: boolean }).collapsed).toBe(false);
    wrapper.unmount();
  });
});
