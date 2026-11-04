/**
 * Unit tests for ClientMessaging.requestSelection (issue #29, amended DR-001).
 * Selection is an authoring gesture and is no longer gated on developer mode;
 * the re-entrancy sequence and failure reporting are exercised here with a
 * stubbed postMessage and simulated SELECTION/STOP messages.
 * Run with: npx vitest run src/app/onshape-utils/__tests__/clientmessaging.test.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock browser APIs
const mockPostMessage = vi.fn();
let capturedMessageHandler: ((event: any) => void) | null = null;
const mockAddEventListener = vi.fn((_type: string, handler: any) => {
  capturedMessageHandler = handler;
});
const mockCryptoRandomUUID = vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2));

beforeEach(() => {
  vi.resetModules();
  capturedMessageHandler = null;
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
  mockPostMessage.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Import after mocks are set up
const { ClientMessaging } = await import('../clientmessaging');

function postCalls(messageName: string) {
  return mockPostMessage.mock.calls.filter((call: any) => call[0]?.messageName === messageName);
}

function simulateMessage(messageName: string, data: Record<string, any> = {}) {
  expect(capturedMessageHandler).not.toBeNull();
  capturedMessageHandler!({
    origin: 'https://cad.onshape.com',
    data: { messageName, ...data },
  });
}

describe('ClientMessaging.requestSelection (issue #29)', () => {
  it('posts requestSelection with developer mode OFF (no DR-001 gate)', () => {
    const messaging = new ClientMessaging('doc-1', 'ws-1', 'elem-1');
    const mockCallback = vi.fn();
    messaging.setDeveloperMode(false);

    messaging.requestSelection(['BODY'], mockCallback, 1, 'test-control-1');

    expect(postCalls('requestSelection')).toHaveLength(1);
    expect(postCalls('showMessageBubble')).toHaveLength(0);
    // Not fulfilled synchronously with []: only a SELECTION may fulfil it.
    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('send → pending → send-again → SELECTION → STOP: exactly one in flight, no double-send', () => {
    const messaging = new ClientMessaging('doc-1', 'ws-1', 'elem-1');
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();
    const firstError = vi.fn();
    const secondError = vi.fn();
    const selection1 = [{ selectionType: 'BODY', selectionId: 's1', entityType: 'BODY' }];
    const selection2 = [{ selectionType: 'BODY', selectionId: 's2', entityType: 'BODY' }];

    // Send: first request is dispatched.
    messaging.requestSelection(['BODY'], firstCallback, 1, 'control-1', firstError);
    expect(postCalls('requestSelection')).toHaveLength(1);
    expect(postCalls('stopRequest')).toHaveLength(0);

    // Send-again while pending: queued, not dispatched; one stopRequest sent.
    messaging.requestSelection(['BODY'], secondCallback, 1, 'control-1', secondError);
    expect(postCalls('requestSelection')).toHaveLength(1);
    expect(postCalls('stopRequest')).toHaveLength(1);

    // SELECTION for the superseded request: delivered to neither callback.
    simulateMessage('SELECTION', { selections: selection1 });
    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).not.toHaveBeenCalled();
    expect(postCalls('requestSelection')).toHaveLength(1);

    // STOP: first request aborts (reported, not callback([])), second dispatches.
    simulateMessage('STOP');
    expect(firstCallback).not.toHaveBeenCalled();
    expect(firstError).toHaveBeenCalledTimes(1);
    expect(firstError.mock.calls[0][0]).toMatch(/stopped before/i);
    expect(postCalls('requestSelection')).toHaveLength(2);
    expect(secondCallback).not.toHaveBeenCalled();

    // SELECTION for the second request is delivered, then STOP ends it cleanly.
    simulateMessage('SELECTION', { selections: selection2 });
    expect(secondCallback).toHaveBeenCalledWith(selection2);
    simulateMessage('STOP');
    expect(secondError).not.toHaveBeenCalled();
    expect(postCalls('requestSelection')).toHaveLength(2);
    expect(postCalls('stopRequest')).toHaveLength(1);
  });

  it('reports a STOP before any SELECTION as a failure, not callback([])', () => {
    const messaging = new ClientMessaging('doc-1', 'ws-1', 'elem-1');
    const mockCallback = vi.fn();
    const mockError = vi.fn();
    const reporter = vi.fn();
    messaging.setFailureReporter(reporter);

    messaging.requestSelection(['BODY'], mockCallback, 1, 'control-1', mockError);
    simulateMessage('STOP');

    expect(mockCallback).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(mockError.mock.calls[0][0]);
  });

  it('reports a failed send through onError and is not left pending', () => {
    const messaging = new ClientMessaging('doc-1', 'ws-1', 'elem-1');
    const mockCallback = vi.fn();
    const mockError = vi.fn();

    mockPostMessage.mockImplementationOnce(() => {
      throw new Error('no parent frame');
    });
    // constructor's applicationInit already used postMessage at construction;
    // the first postMessage after this point is the requestSelection send.
    messaging.requestSelection(['BODY'], mockCallback, 1, 'control-1', mockError);

    expect(mockCallback).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError.mock.calls[0][0]).toMatch(/no parent frame/);

    // Not stuck in-flight: a later request dispatches normally. (The failed
    // attempt is also recorded by the mock, hence 2 calls in total.)
    const laterCallback = vi.fn();
    messaging.requestSelection(['BODY'], laterCallback, 1, 'control-1');
    expect(postCalls('requestSelection')).toHaveLength(2);
    simulateMessage('SELECTION', { selections: [{ selectionType: 'BODY', selectionId: 's9', entityType: 'BODY' }] });
    expect(laterCallback).toHaveBeenCalledTimes(1);
  });

  it('delivers an empty SELECTION to the callback (caller decides not to clear)', () => {
    const messaging = new ClientMessaging('doc-1', 'ws-1', 'elem-1');
    const mockCallback = vi.fn();
    const mockError = vi.fn();

    messaging.requestSelection(['BODY'], mockCallback, 1, 'control-1', mockError);
    simulateMessage('SELECTION', { selections: [] });

    // ClientMessaging does not swallow it and does not treat it as a
    // failure; QueryListControl guards its existing value and reports.
    expect(mockCallback).toHaveBeenCalledWith([]);
    expect(mockError).not.toHaveBeenCalled();
  });

  it('clearWarningTracker is a retained no-op (compatibility)', () => {
    const messaging = new ClientMessaging('doc-1', 'ws-1', 'elem-1');
    expect(() => messaging.clearWarningTracker()).not.toThrow();
  });
});
