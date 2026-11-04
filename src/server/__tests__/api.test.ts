import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("node-fetch", () => ({ default: mockFetch }));
vi.mock("node:dns", () => ({
  promises: {
    lookup: vi.fn(async (_host: string) => [{ address: "93.184.216.34", family: 4 }]),
  },
}));

import api from "../api";
import { HeaderMap, HttpRequest } from "../httpTypes";

function makeRequest(headers: Record<string, string> = {}, overrides: Partial<HttpRequest> = {}): HttpRequest {
  const map = { ...headers } as HeaderMap;
  map.forEach = (cb: (value: string, key: string) => void) => {
    for (const [k, v] of Object.entries(headers)) cb(v, k);
  };
  return {
    method: "GET",
    url: "http://localhost/api/documents?x=1",
    query: new URLSearchParams("x=1"),
    headers: map,
    body: undefined,
    arrayBuffer: async () => new ArrayBuffer(0),
    ...overrides,
  };
}

describe("api SSRF (#38)", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("a malicious x-server is refused before fetch", async () => {
    const res = await api(makeRequest({ "x-server": "http://169.254.169.254" }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("an allowlisted x-server with https is proxied", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (n: string) => (n === "content-type" ? "application/json" : null) },
      arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
    });
    const res = await api(makeRequest({ "x-server": "https://cad.onshape.com" }));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toBe("https://cad.onshape.com/api/documents?x=1");
  });

  it("strips Cookie and non-Bearer Authorization, drops Proxy-Url", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const res = await api(makeRequest({
      "x-server": "https://cad.onshape.com",
      cookie: "session=secret",
      authorization: "Basic dXNlcjpwYXNz",
      "x-custom": "keep",
    }));
    const forwarded = mockFetch.mock.calls[0][1].headers;
    const names = Object.keys(forwarded).map((n) => n.toLowerCase());
    expect(names).not.toContain("cookie");
    expect(names).not.toContain("authorization");
    expect(names).toContain("x-custom");
    expect(res.headers?.["Proxy-Url"]).toBeUndefined();
  });

  it("forwards the client's own Bearer token", async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    await api(makeRequest({ "x-server": "https://cad.onshape.com", authorization: "Bearer token123" }));
    const forwarded = mockFetch.mock.calls[0][1].headers;
    const names = Object.keys(forwarded).map((n) => n.toLowerCase());
    expect(names).toContain("authorization");
  });

  it("returns a generic body, not the upstream body, on upstream error", async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 500,
      headers: { get: () => null },
      text: async () => "internal secret detail",
    });
    const res = await api(makeRequest({ "x-server": "https://cad.onshape.com" }));
    expect(res.status).toBe(500);
    expect(res.body).toBe("upstream error");
  });
});
