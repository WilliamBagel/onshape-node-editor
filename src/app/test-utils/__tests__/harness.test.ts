/**
 * Example UI-harness tests (issue #75). Run with: pnpm run test:ui
 *
 *  1. nested map expand/collapse
 *  2. title rename through the real rename input
 *  3. command dispatch + message assertion (fake messaging)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeCustomFeatureNodeWithMap, makeMathNode, makeSinglePartStudioDocument, makeFunctionNode } from '../fixtures';
import { mountNode, toggleNestedMap, renameTitle, dispatchCommand, assertSent } from '../ui-helpers';
import { createFakeOnshapeApi } from '../fake-onshape-api';
import { FakeMessagingChannel, installFakeWindowMessaging } from '../fake-messaging';
import { resolveSinglePartStudio } from '../../onshape-utils/partstudiotarget';
import { DialogService } from '../../ui/dialog';

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('harness: nested map expand', () => {
  it('toggles expanded state and reveals nested parameters', async () => {
    const node = makeCustomFeatureNodeWithMap();
    const { wrapper } = await mountNode(node);
    const before = wrapper.find('.map-parameters').exists();
    expect(before).toBe(false);
    const expanded = await toggleNestedMap(wrapper);
    expect(expanded).toBe(true);
    expect(wrapper.find('.map-parameters').exists()).toBe(true);
    const collapsed = await toggleNestedMap(wrapper);
    expect(collapsed).toBe(false);
    wrapper.unmount();
  });
});

describe('harness: title rename', () => {
  it('renames through the rename input and syncs the node', async () => {
    // FunctionNode is the node whose getTitle() reflects setTitle();
    // CustomFeatureNode/MathExpressionNode derive titles elsewhere.
    const node = makeFunctionNode();
    const original = node.getTitle();
    const { wrapper } = await mountNode(node);
    expect(wrapper.find('.ns-dialog-title').text()).toBe(original);
    await renameTitle(wrapper, 'Renamed Math');
    expect(node.getTitle()).toBe('Renamed Math');
    expect(wrapper.find('.ns-dialog-title').text()).toBe('Renamed Math');
    wrapper.unmount();
  });
});

describe('harness: command dispatch + message assertion', () => {
  it('records the dispatched command on the proxy bus', async () => {
    const node = makeCustomFeatureNodeWithMap();
    const { wrapper, proxied } = await mountNode(node);
    dispatchCommand(proxied, 'expand', { nodeId: node.id });
    expect(proxied.some((p) => p[0] === 'expand')).toBe(true);
    wrapper.unmount();
  });

  it('fake messaging: request/response round trip + ClientMessaging seam', async () => {
    const channel = new FakeMessagingChannel();
    channel.respondWith('ping', { ok: true });
    await channel.request('ping', { hello: 'world' });
    assertSent(channel.sent, 'ping', (m) => (m.data as { hello: string }).hello === 'world');

    const fake = installFakeWindowMessaging();
    try {
      const { ClientMessaging } = await import('../../onshape-utils/clientmessaging');
      const messaging = new ClientMessaging('doc', 'ws', 'elem');
      messaging.showMessageBubble('hello');
      assertSent(fake.sent, 'showMessageBubble');
    } finally {
      fake.uninstall();
    }
  });

  it('dialogs open/close through DialogService without DOM', async () => {
    const service = new DialogService();
    const seen: unknown[] = [];
    service.registerHost((req) => seen.push(req));
    const pending = service.promptText({ title: 'Name', initialValue: 'A' });
    expect(service.current?.kind).toBe('prompt');
    service.submitPrompt('B');
    await expect(pending).resolves.toBe('B');
    expect(service.current).toBeNull();
  });

  it('fake document API resolves the single Part Studio', async () => {
    const doc = makeSinglePartStudioDocument();
    const api = createFakeOnshapeApi(doc);
    const result = await resolveSinglePartStudio(api.documentApi, doc.context);
    expect(result.status).toBe('unique');
    if (result.status === 'unique') expect(result.target.eid).toBe(doc.partStudioId);
    expect(api.callsFor('documentApi', 'getElementsInDocument')).toHaveLength(1);
  });

  it('math node exposes typed sockets', async () => {
    const node = makeMathNode('length * width');
    const { wrapper } = await mountNode(node);
    expect(node.getFreeVariables()).toEqual(['length', 'width']);
    expect(Object.keys(node.outputs)).toEqual(['return']);
    wrapper.unmount();
  });
});

describe('node chrome: empty map, left header, collapsed sockets, title focus', () => {
  it('shows an empty state with aria label when a map has no child parameters', async () => {
    const node = makeCustomFeatureNodeWithMap();
    const definition: any = node.getDefinitionInput();
    definition.paramInputs = {};
    definition.hiddenParameters = {};
    definition.expanded = true;
    const { wrapper } = await mountNode(node);
    const empty = wrapper.find('.map-empty-state');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('Definition (empty)');
    expect(empty.text()).toContain('No parameters');
    expect(empty.attributes('aria-label')).toContain('Definition (empty)');
    expect(wrapper.find('.map-header-empty').text()).toBe('(empty)');
    wrapper.unmount();
  });

  it('left-aligns the map header caret and title', async () => {
    const node = makeCustomFeatureNodeWithMap();
    const { wrapper } = await mountNode(node);
    const content = wrapper.find('.map-header-content');
    expect(content.exists()).toBe(true);
    expect(wrapper.find('.map-header-content.os-center-content').exists()).toBe(false);
    // jsdom does not cascade SFC scoped styles; pin the stylesheet contract.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/app/customization/OnshapeInputMap.vue', 'utf8');
    expect(source).toContain('map-header-content');
    expect(source).toMatch(/\.map-header-content\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*flex-start[^}]*text-align:\s*left/);
    wrapper.unmount();
  });

  it('preserves sockets while collapsed and shows full rows when expanded', async () => {
    const node = makeCustomFeatureNodeWithMap();
    const expectedInputs = wrapperInputKeys(node);
    const { wrapper } = await mountNode(node);
    // Expanded: full rows, no strip.
    expect(wrapper.find('[data-testid="collapsed-socket-strip"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="input-socket"]').length).toBeGreaterThan(0);
    // Expand the definition so nested leaves are mounted.
    const map = wrapper.findComponent({ name: 'OnshapeInputMap' } as any);
    expect(map.exists()).toBe(true);
    await map.find('.node-expander').trigger('click');
    await wrapper.vm.$nextTick();
    const expandedInputs = wrapper.findAll('[data-testid="input-socket"]').length;
    expect(expandedInputs).toBeGreaterThan(0);
    // Collapse the node.
    await wrapper.find('.node-collapse-toggle').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.dialog-content').exists()).toBe(false);
    const strip = wrapper.find('[data-testid="collapsed-socket-strip"]');
    expect(strip.exists()).toBe(true);
    expect(strip.attributes('aria-label')).toContain('sockets');
    const collapsedInputs = wrapper.findAll('[data-testid="collapsed-input-socket"]');
    const collapsedOutputs = wrapper.findAll('[data-testid="collapsed-output-socket"]');
    expect(collapsedInputs.length).toBe(expandedInputs);
    expect(collapsedOutputs.length).toBe(Object.keys(node.outputs).length);
    // No duplicate registrations, correct side/key/data. Read the descriptors
    // from the component (the Ref stub does not expose props in jsdom).
    const read = (value: unknown) => (typeof value === "function" ? (value as () => any[])() : value as any[]);
    const descriptors = [...read((wrapper.vm as any).collapsedInputs), ...read((wrapper.vm as any).collapsedOutputs)];
    expect(descriptors.length).toBe(collapsedInputs.length + collapsedOutputs.length);
    const keys = read((wrapper.vm as any).collapsedInputs).map((d: any) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...new Set(expectedInputs.filter((k) => k !== 'definition'))].sort());
    for (const d of descriptors) {
      expect(['input', 'output']).toContain(d.side);
      expect(d.nodeId).toBe(node.id);
      expect(d.payload).toBeDefined();
    }
    expect(read((wrapper.vm as any).collapsedOutputs).length).toBe(collapsedOutputs.length);
    // Re-expand restores the full rows and removes the strip.
    await wrapper.find('.node-collapse-toggle').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="collapsed-socket-strip"]').exists()).toBe(false);
    expect(wrapper.find('.dialog-content').exists()).toBe(true);
    wrapper.unmount();
  });

  it('title editor uses title typography and a quiet hairline focus, not a blue outline', async () => {
    const node = makeFunctionNode();
    const { wrapper } = await mountNode(node);
    const editor = wrapper.find('.node-title-editor');
    expect(editor.exists()).toBe(true);
    expect(editor.classes()).toContain('os-dialog-header-rename-textbox');
    // jsdom does not cascade SFC scoped styles; pin the stylesheet contract.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/app/customization/OnshapeNode.vue', 'utf8');
    expect(source).toMatch(/\.node-title-editor\s*\{[^}]*font-size:\s*var\(--node-title-size\)/);
    expect(source).toMatch(/\.node-title-editor:focus\s*\{[^}]*outline:\s*none/);
    expect(source).toMatch(/\.node-title-editor:focus\s*\{[^}]*var\(--node-hairline-strong\)/);
    expect(source).not.toMatch(/\.os-dialog-header-rename-textbox:focus\s*\{[^}]*--node-accent/);
    wrapper.unmount();
  });
});

function wrapperInputKeys(node: any): string[] {
  const keys: string[] = [];
  const visit = (entries: [string, any][]) => {
    for (const [key, input] of entries) {
      if (input && (input.paramInputs || input.type === 'map')) {
        visit(Object.entries(input.paramInputs ?? {}).filter(([k]) => input.hiddenParameters?.[k] !== true) as any);
      } else {
        keys.push(key);
      }
    }
  };
  visit(Object.entries(node.inputs ?? {}));
  return keys;
}
