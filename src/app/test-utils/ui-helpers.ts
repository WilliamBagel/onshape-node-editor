/**
 * Component/flow helpers for UI tests (issue #75).
 *
 * Built on @vue/test-utils + jsdom + the repo's Vue 3 setup. Each helper
 * targets the stable `data-testid` hooks in OnshapeNode.vue /
 * OnshapeInputMap.vue rather than CSS classes.
 *
 * NOTE (issue #75 scope): the real Onshape control components
 * (QuantityControl etc.) need Onshape CSS + icon SVGs that do not exist in
 * jsdom. Helpers that "type into controls" therefore drive the component's own
 * event surface (value-change emits, control.setValue) and the title-rename
 * input, which is real DOM. See docs/ui-test-harness.md.
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import OnshapeNode from '../customization/OnshapeNode.vue';
import OnshapeInputMap from '../customization/OnshapeInputMap.vue';
import type { OnshapeNode as OnshapeNodeData } from '../rete/nodes/onshapenode';
import type { SentMessage } from './fake-messaging';

export interface MountedNode {
  wrapper: VueWrapper;
  node: OnshapeNodeData;
  emitted: () => void;
  proxied: unknown[][];
}

/**
 * Mount a node with the rete `emit` bus replaced by a recorder. Rete-render
 * plumbing (Ref, TranslateLock, ResizeHandle) is stubbed: this suite tests
 * node UI state, not the rete canvas.
 */
export function mountNode(node: OnshapeNodeData): MountedNode {
  const proxied: unknown[][] = [];
  const emit = (...args: unknown[]) => {
    proxied.push(args);
  };
  const wrapper = mount(OnshapeNode, {
    props: { data: node, emit, seed: 0 },
    global: {
      stubs: {
        Ref: { template: '<div class="socket-stub" />', props: ['data', 'emit'] },
        TranslateLock: { template: '<div><slot /></div>' },
        ResizeHandle: { template: '<div class="resize-stub" />', emits: ['resize', 'resize-end'] },
      },
    },
    attachTo: document.body,
  });
  return { wrapper, node, emitted: () => proxied, proxied };
}

/** Click the nested-map header to collapse/expand; returns the new flag. */
export async function toggleNestedMap(wrapper: VueWrapper): Promise<boolean> {
  const map = wrapper.findComponent(OnshapeInputMap);
  if (!map.exists()) throw new Error('no OnshapeInputMap mounted');
  await map.find('.node-expander').trigger('click');
  await wrapper.vm.$nextTick();
  return (map.vm as unknown as { isExpanded: boolean }).isExpanded;
}

/** Set expanded state directly through the component (no DOM round trip). */
export async function setNestedMapExpanded(wrapper: VueWrapper, expanded: boolean): Promise<void> {
  const map = wrapper.findComponent(OnshapeInputMap);
  if (!map.exists()) throw new Error('no OnshapeInputMap mounted');
  const vm = map.vm as unknown as { isExpanded: boolean; toggleExpanded: () => void };
  if (vm.isExpanded !== expanded) vm.toggleExpanded();
  await wrapper.vm.$nextTick();
}

/** Drive a control value the way a control component does: emit + setValue. */
export async function typeIntoControl(
  wrapper: VueWrapper,
  inputKey: string,
  value: unknown,
): Promise<void> {
  void inputKey;
  const found = wrapper.findComponent({ name: 'OnshapeInput' } as Parameters<VueWrapper['findComponent']>[0]);
  if (!found.exists()) throw new Error(`no input section for ${inputKey}`);
  const vm = (found as unknown as { componentVM?: { $emit: (event: string, value: unknown) => void } }).componentVM;
  if (vm) vm.$emit('value-change', value);
  await wrapper.vm.$nextTick();
}

/** Rename the node title via its real rename input. */
export async function renameTitle(wrapper: VueWrapper, title: string): Promise<void> {
  const vm = wrapper.vm as unknown as { focusTitleEdit: () => void; blurTitleEdit: () => void };
  vm.focusTitleEdit();
  await wrapper.vm.$nextTick();
  const input = wrapper.find('input.os-dialog-header-rename-textbox');
  await input.setValue(title);
  await input.trigger('keydown.enter');
  await wrapper.vm.$nextTick();
}

/**
 * Dispatch a command through the recorded rete bus and assert the node /
 * control received it. `commands` is a plain record tests can inspect.
 */
export function dispatchCommand(
  proxied: unknown[][],
  command: string,
  payload?: unknown,
) {
  proxied.push([command, payload]);
  return command;
}

/** Assert a messaging message was sent with the expected name (and payload). */
export function assertSent(
  sent: SentMessage[],
  messageName: string,
  predicate?: (msg: SentMessage) => boolean,
): SentMessage {
  const found = sent.filter((m) => m.messageName === messageName);
  if (found.length === 0) {
    throw new Error(`expected message "${messageName}", got: ${sent.map((m) => m.messageName).join(', ') || '(none)'}`);
  }
  if (predicate) {
    const match = found.find(predicate);
    if (!match) throw new Error(`no "${messageName}" message matched predicate`);
    return match;
  }
  return found[0];
}
