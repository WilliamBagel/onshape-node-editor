import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("node-fetch", () => ({ default: mockFetch }));
vi.mock("node:dns", () => ({
  promises: {
    lookup: vi.fn(async (_host: string) => [{ address: "93.184.216.34", family: 4 }]),
  },
}));

import api from "../api";
import getfile from "../getfile";
import { readBoundedBody, UpstreamBodyError } from "../security";
import type { HeaderMap, HttpRequest } from "../httpTypes";

function headersMap(headers: Record<string, string>): HeaderMap {
  const map = { ...headers } as HeaderMap;
  map.forEach = (cb: (value: string, key: string) => void) => {
    for (const [k, v] of Object.entries(headers)) cb(v, k);
  };
  return map;
}

function apiRequest(): HttpRequest {
  return {
    method: "GET",
    url: "http://localhost/api/documents",
    query: new URLSearchParams(),
    headers: headersMap({ "x-server": "https://cad.onshape.com" }),
    body: undefined,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function getfileRequest(): HttpRequest {
  return {
    method: "GET",
    url: "http://localhost/getfile?url=" + encodeURIComponent("https://cad.onshape.com/css/x.css"),
    query: new URLSearchParams("url=" + encodeURIComponent("https://cad.onshape.com/css/x.css")),
    headers: headersMap({}),
    body: undefined,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

/** Web-ReadableStream body that releases `chunks` with a delay between them. */
function streamingBody(chunks: Array<Uint8Array | number>, delayMs = 0) {
  const queue: Array<Uint8Array> = chunks.map((c) =>
    typeof c === "number" ? new Uint8Array(c) : c,
  );
  let i = 0;
  let closed = false;
  const safeEnqueue = (controller: ReadableStreamDefaultController, next: Uint8Array) => {
    if (closed) return;
    try { controller.enqueue(next); } catch { closed = true; }
  };
  const safeClose = (controller: ReadableStreamDefaultController) => {
    if (closed) return;
    closed = true;
    try { controller.close(); } catch { /* noop */ }
  };
  const stream = new ReadableStream({
    pull(controller) {
      if (i >= queue.length) {
        safeClose(controller);
        return;
      }
      const next = queue[i++];
      if (delayMs > 0) {
        setTimeout(() => {
          if (i >= queue.length) safeClose(controller);
          else safeEnqueue(controller, next);
        }, delayMs);
      } else {
        safeEnqueue(controller, next);
      }
    },
    cancel() { closed = true; },
  });
  return stream;
}

describe("readBoundedBody (#79)", () => {
  it("reads a normal streaming body", async () => {
    const response = { body: streamingBody([new TextEncoder().encode("hello ")]), headers: { get: () => null } };
    // two chunks
    const resp2 = { body: streamingBody([new TextEncoder().encode("ab"), new TextEncoder().encode("cd")]), headers: { get: () => null } };
    void response;
    const buf = await readBoundedBody(resp2);
    expect(buf.toString("utf8")).toBe("abcd");
  });

  it("times out a slow streaming body", async () => {
    const response = {
      body: streamingBody([new TextEncoder().encode("x"), new TextEncoder().encode("y")], 150),
      headers: { get: () => null },
    };
    await expect(readBoundedBody(response, { timeoutMs: 100 })).rejects.toMatchObject({ reason: "timeout" });
  });

  it("rejects an oversized streaming body without buffering it all", async () => {
    const big = new Uint8Array(10_000);
    const body = streamingBody([big, big, big], 0);
    const response = { body, headers: { get: () => null } };
    await expect(readBoundedBody(response, { maxBytes: 12_000 })).rejects.toMatchObject({ reason: "oversize" });
  });

  it("fast-fails on an oversize content-length header", async () => {
    const response = {
      body: streamingBody([new TextEncoder().encode("x")]),
      headers: { get: (n: string) => (n === "content-length" ? "99999999" : null) },
    };
    await expect(readBoundedBody(response, { maxBytes: 1000 })).rejects.toMatchObject({ reason: "oversize" });
  });
});

describe("api/getfile body limits (#79)", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("api: normal body passes through", async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => "application/json" },
      body: streamingBody([new TextEncoder().encode('{"ok":true}')]),
    });
    const res = await api(apiRequest());
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body as ArrayBuffer).toString("utf8")).toBe('{"ok":true}');
  });

  it("api: slow body -> 504 generic", async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => "text/plain" },
      body: streamingBody([new TextEncoder().encode("a"), new TextEncoder().encode("b")], 150),
    });
    process.env.UPSTREAM_BODY_TIMEOUT_MS = "100";
    try {
      const res = await api(apiRequest());
      expect(res.status).toBe(504);
      expect(res.body).toBe("upstream error");
    } finally {
      delete process.env.UPSTREAM_BODY_TIMEOUT_MS;
    }
  });

  it("api: oversize body -> 502 generic", async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      body: streamingBody([new Uint8Array(200_000)]),
    });
    process.env.MAX_UPSTREAM_BYTES = "65536";
    try {
      const res = await api(apiRequest());
      expect(res.status).toBe(502);
      expect(res.body).toBe("upstream error");
    } finally {
      delete process.env.MAX_UPSTREAM_BYTES;
    }
  });

  it("getfile: normal body, generic 502 on upstream error status", async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 404,
      headers: { get: () => "text/html" },
      arrayBuffer: async () => new TextEncoder().encode("<html>leaked secret</html>").buffer,
    });
    const res = await getfile(getfileRequest());
    expect(res.status).toBe(502);
    expect(String(res.body)).toBe("upstream error");
  });

  it("getfile: slow body -> 504", async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => "text/css" },
      body: streamingBody([new TextEncoder().encode("a"), new TextEncoder().encode("b")], 150),
    });
    process.env.UPSTREAM_BODY_TIMEOUT_MS = "100";
    try {
      const res = await getfile(getfileRequest());
      expect(res.status).toBe(504);
    } finally {
      delete process.env.UPSTREAM_BODY_TIMEOUT_MS;
    }
  });
});
