/**
 * Fake client-messaging channel for UI tests (issue #75).
 *
 * Two layers, both without any network or real iframe:
 *  1. `FakeMessagingChannel` — a small request/response bus. Code under test
 *     calls `request(name, data)`; tests assert what was sent and reply with
 *     `respondWith(name, data)` or `simulateInbound(name, data)`.
 *  2. `installFakeWindowMessaging()` — stubs the exact `window.parent.postMessage`
 *     + `window.addEventListener('message')` seams the real `ClientMessaging`
 *     class uses, so the real class can be driven in jsdom without an Onshape
 *     parent frame. Returns `{ sent, simulateInbound, uninstall }`.
 */
import { vi } from 'vitest';

export interface SentMessage {
  messageName: string;
  data?: Record<string, unknown>;
  requestId?: string;
}

type Handler = (message: SentMessage) => unknown;

export class FakeMessagingChannel {
  sent: SentMessage[] = [];
  private handlers = new Map<string, Handler>();
  private counter = 0;

  on(messageName: string, handler: Handler) {
    this.handlers.set(messageName, handler);
    return () => {
      if (this.handlers.get(messageName) === handler) this.handlers.delete(messageName);
    };
  }

  /** Send a request; resolves with the registered handler's return value. */
  async request<T = unknown>(messageName: string, data: Record<string, unknown> = {}): Promise<T> {
    const requestId = `req-${++this.counter}`;
    this.sent.push({ messageName, data, requestId });
    const handler = this.handlers.get(messageName);
    if (!handler) return undefined as T;
    return (await handler({ messageName, data, requestId })) as T;
  }

  /** Fire-and-forget send (mirrors ClientMessaging.showMessageBubble). */
  send(messageName: string, data: Record<string, unknown> = {}) {
    this.sent.push({ messageName, data });
  }

  /** Register a canned response for the next matching request. */
  respondWith(messageName: string, response: unknown) {
    this.handlers.set(messageName, () => response);
  }

  sentNames(): string[] {
    return this.sent.map((m) => m.messageName);
  }

  sentFor(messageName: string): SentMessage[] {
    return this.sent.filter((m) => m.messageName === messageName);
  }

  reset() {
    this.sent = [];
    this.handlers.clear();
    this.counter = 0;
  }
}

export interface FakeWindowMessaging {
  sent: SentMessage[];
  postMessage: ReturnType<typeof vi.fn>;
  simulateInbound: (messageName: string, data?: Record<string, unknown>) => void;
  uninstall: () => void;
}

/**
 * Stub window.parent.postMessage and capture the one message listener
 * ClientMessaging installs, matching the pattern used by
 * src/app/onshape-utils/__tests__/clientmessaging.test.ts.
 */
export function installFakeWindowMessaging(
  origin = 'https://cad.onshape.com',
): FakeWindowMessaging {
  const sent: SentMessage[] = [];
  const postMessage = vi.fn((msg: { messageName?: string } & Record<string, unknown>) => {
    sent.push({ messageName: msg.messageName ?? '', data: msg as Record<string, unknown> });
  });
  let captured: ((event: unknown) => void) | null = null;
  const addEventListener = vi.fn((_type: string, handler: (event: unknown) => void) => {
    captured = handler;
  });
  const originalWindow = globalThis.window as unknown as Record<string, unknown> | undefined;
  const fakeWindow = {
    parent: { postMessage },
    addEventListener,
    crypto: { randomUUID: () => `fake-uuid-${Math.floor(Math.random() * 1e9)}` },
    location: { origin },
    document: { referrer: origin },
  };
  (globalThis as unknown as Record<string, unknown>).window = fakeWindow;

  return {
    sent,
    postMessage,
    simulateInbound(messageName, data = {}) {
      if (!captured) throw new Error('no message listener captured — is ClientMessaging on screen?');
      captured({ origin, data: { messageName, ...data } });
    },
    uninstall() {
      if (originalWindow === undefined) {
        delete (globalThis as unknown as Record<string, unknown>).window;
      } else {
        (globalThis as unknown as Record<string, unknown>).window = originalWindow;
      }
    },
  };
}
