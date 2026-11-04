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
