/**
 * Unit tests for DR-001 enforcement in ClientMessaging.requestSelection
 * Tests the warning gate with developer mode off/on.
 * Run with: npx vitest run src/app/onshape-utils/__tests__/clientmessaging.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock browser APIs
const mockPostMessage = vi.fn();
const mockAddEventListener = vi.fn();
const mockCryptoRandomUUID = vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', {
    parent: { postMessage: mockPostMessage },
    addEventListener: mockAddEventListener,
    crypto: { randomUUID: mockCryptoRandomUUID },
    location: { origin: 'https://cad.onshape.com' },
    document: { referrer: 'https://cad.onshape.com' },
  });
  vi.stubGlobal('crypto', { randomUUID: mockCryptoRandomUUID });
  mockPostMessage.mockClear();
  mockAddEventListener.mockClear();
  mockCryptoRandomUUID.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Import after mocks are set up
const { ClientMessaging } = await import('../clientmessaging');

describe('ClientMessaging.requestSelection DR-001 gate', () => {
  let messaging: InstanceType<typeof ClientMessaging>;
  const mockCallback = vi.fn();

  beforeEach(() => {
    messaging = new ClientMessaging('doc-1', 'ws-1', 'elem-1');
    mockCallback.mockClear();
  });

  it('emits a visible warning when developer mode is OFF', () => {
    messaging.setDeveloperMode(false);

    messaging.requestSelection(['BODY'], mockCallback, 1, 'test-control-1');

    // Should show message bubble (visible warning)
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageName: 'showMessageBubble',
        message: expect.stringContaining('DR-001: Interactive selection'),
      }),
      '*'
    );

    // Should call callback with empty selections (not break control flow)
    expect(mockCallback).toHaveBeenCalledWith([]);
  });

  it('does NOT emit warning when developer mode is ON', () => {
    messaging.setDeveloperMode(true);

    messaging.requestSelection(['BODY'], mockCallback, 1, 'test-control-1');

    // Should NOT show message bubble
    const showMessageBubbleCalls = mockPostMessage.mock.calls.filter(
      (call) => call[0]?.messageName === 'showMessageBubble'
    );
    expect(showMessageBubbleCalls).toHaveLength(0);

    // Should send requestSelection message to parent
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageName: 'requestSelection',
        entityTypeSpecifier: ['BODY'],
      }),
      '*'
    );
  });

  it('emits only ONE warning per control when called multiple times with developer mode OFF', () => {
    messaging.setDeveloperMode(false);

    // First call
    messaging.requestSelection(['BODY'], mockCallback, 1, 'test-control-1');
    // Second call with same controlId
    messaging.requestSelection(['BODY'], mockCallback, 1, 'test-control-1');
    // Third call with same controlId
    messaging.requestSelection(['BODY'], mockCallback, 1, 'test-control-1');

    // Should only show message bubble ONCE
    const showMessageBubbleCalls = mockPostMessage.mock.calls.filter(
      (call: any) => call[0]?.messageName === 'showMessageBubble'
    );
    expect(showMessageBubbleCalls).toHaveLength(1);
  });

  it('emits separate warnings for DIFFERENT controls when developer mode is OFF', () => {
    messaging.setDeveloperMode(false);

    messaging.requestSelection(['BODY'], mockCallback, 1, 'control-A');
    messaging.requestSelection(['BODY'], mockCallback, 1, 'control-B');

    // Should show message bubble TWICE (once per control)
    const showMessageBubbleCalls = mockPostMessage.mock.calls.filter(
      (call: any) => call[0]?.messageName === 'showMessageBubble'
    );
    expect(showMessageBubbleCalls).toHaveLength(2);
  });

  it('clears warning tracker when clearWarningTracker is called', () => {
    messaging.setDeveloperMode(false);

    messaging.requestSelection(['BODY'], mockCallback, 1, 'test-control-1');
    messaging.clearWarningTracker();
    messaging.requestSelection(['BODY'], mockCallback, 1, 'test-control-1');

    // Should show message bubble TWICE (tracker was cleared)
    const showMessageBubbleCalls = mockPostMessage.mock.calls.filter(
      (call: any) => call[0]?.messageName === 'showMessageBubble'
    );
    expect(showMessageBubbleCalls).toHaveLength(2);
  });

  it('uses "unknown-control" as fallback when no controlId provided', () => {
    messaging.setDeveloperMode(false);

    messaging.requestSelection(['BODY'], mockCallback, 1); // no controlId
    messaging.requestSelection(['BODY'], mockCallback, 1); // no controlId

    // Should show message bubble ONCE (same fallback key)
    const showMessageBubbleCalls = mockPostMessage.mock.calls.filter(
      (call: any) => call[0]?.messageName === 'showMessageBubble'
    );
    expect(showMessageBubbleCalls).toHaveLength(1);
  });
});

describe('ClientMessaging developer mode toggle', () => {
  it('respects developer mode changes at runtime', () => {
    const messaging = new ClientMessaging('doc-1', 'ws-1', 'elem-1');
    const mockCallback = vi.fn();

    // Start in developer mode OFF
    messaging.setDeveloperMode(false);
    messaging.requestSelection(['BODY'], mockCallback, 1, 'control-1');
    let showMessageBubbleCalls = mockPostMessage.mock.calls.filter(
      (call: any) => call[0]?.messageName === 'showMessageBubble'
    );
    expect(showMessageBubbleCalls).toHaveLength(1);

    // Switch to developer mode ON
    messaging.setDeveloperMode(true);
    mockPostMessage.mockClear();
    mockCallback.mockClear();
    messaging.requestSelection(['BODY'], mockCallback, 1, 'control-1');
    showMessageBubbleCalls = mockPostMessage.mock.calls.filter(
      (call: any) => call[0]?.messageName === 'showMessageBubble'
    );
    expect(showMessageBubbleCalls).toHaveLength(0);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageName: 'requestSelection' }),
      '*'
    );

    // Switch back to developer mode OFF. The instance has already warned for
    // this control, and DR-001's gate is "one warning per control per graph
    // load" — re-warning requires clearing the tracker, which is what a graph
    // load does. Without that this assertion contradicts the
    // "emits only ONE warning per control" case above.
    messaging.setDeveloperMode(false);
    messaging.clearWarningTracker();
    mockPostMessage.mockClear();
    mockCallback.mockClear();
    messaging.requestSelection(['BODY'], mockCallback, 1, 'control-1');
    showMessageBubbleCalls = mockPostMessage.mock.calls.filter(
      (call: any) => call[0]?.messageName === 'showMessageBubble'
    );
    expect(showMessageBubbleCalls).toHaveLength(1);

    // Without the clear, the same control is not warned twice.
    mockPostMessage.mockClear();
    messaging.requestSelection(['BODY'], mockCallback, 1, 'control-1');
    showMessageBubbleCalls = mockPostMessage.mock.calls.filter(
      (call: any) => call[0]?.messageName === 'showMessageBubble'
    );
    expect(showMessageBubbleCalls).toHaveLength(0);
  });
});