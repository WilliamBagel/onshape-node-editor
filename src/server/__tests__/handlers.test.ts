import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("node-fetch", () => ({ default: mockFetch }));
vi.mock("node:dns", () => ({
  promises: {
    lookup: vi.fn(async (_host: string) => [{ address: "93.184.216.34", family: 4 }]),
  },
}));

import type { HeaderMap, HttpRequest } from "../httpTypes";

let refresh: any;
let getfile: any;
let oauthsignin: any;

// config.ts snapshots process.env at import time, so stub env first and
// import the handlers dynamically.
beforeAll(async () => {
  vi.stubEnv("CLIENT_URL", "https://oauth.onshape.com/oauth/token");
  vi.stubEnv("CLIENT_ID", "test-client");
  vi.stubEnv("CLIENT_SECRET", "test-secret");
  refresh = (await import("../refresh")).default;
  getfile = (await import("../getfile")).default;
  oauthsignin = (await import("../oauthsignin")).default;
});

function makeRequest(opts: {
  headers?: Record<string, string>;
  query?: string;
  body?: any;
  method?: string;
  url?: string;
} = {}): HttpRequest {
  const rawHeaders = opts.headers ?? {};
  const map = { ...rawHeaders } as HeaderMap;
  map.forEach = (cb: (value: string, key: string) => void) => {
    for (const [k, v] of Object.entries(rawHeaders)) cb(v, k);
  };
  const url = opts.url ?? `http://localhost/test${opts.query ? `?${opts.query}` : ""}`;
  return {
    method: opts.method ?? "POST",
    url,
    query: new URLSearchParams(opts.query ?? ""),
    headers: map,
    body: opts.body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe("refresh (#49, #51)", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("rejects a refresh token supplied in the query string", async () => {
    const res = await refresh(makeRequest({ query: "refresh_token=abc", body: {} }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("accepts the token from the POST body and marks the response no-store", async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: { entries: () => [["set-cookie", "leak=1"], ["content-type", "application/json"]] },
      json: async () => ({ access_token: "tok", refresh_token: "r2", expires_in: 3600 }),
    });
    const res = await refresh(makeRequest({ body: { refresh_token: "abc" } }));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res.headers?.["Cache-Control"]).toContain("no-store");
    const names = Object.keys(res.headers ?? {}).map((n) => n.toLowerCase());
    expect(names).not.toContain("set-cookie");
  });

  it("accepts a form-encoded body token", async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: { entries: () => [] },
      json: async () => ({ access_token: "tok" }),
    });
    const res = await refresh(makeRequest({ body: { refreshToken: "abc" } }));
    expect(res.status).toBe(200);
  });
});

describe("getfile (#49)", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("forwards only Accept / Accept-Language", async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: { get: () => "text/css" },
      arrayBuffer: async () => new TextEncoder().encode("x").buffer,
    });
    const res = await getfile(makeRequest({
      query: "url=" + encodeURIComponent("https://cad.onshape.com/css/file.css"),
      method: "GET",
      headers: { authorization: "Bearer secret", cookie: "a=b", accept: "text/css", "accept-language": "en" },
    }));
    expect(res.status).toBe(200);
    const forwarded = mockFetch.mock.calls[0][1].headers;
    const names = Object.keys(forwarded).map((n) => n.toLowerCase());
    expect(names.sort()).toEqual(["accept", "accept-language"]);
  });

  it("refuses a non-allowlisted host before fetch", async () => {
    const res = await getfile(makeRequest({
      query: "url=" + encodeURIComponent("https://evil.example/x"),
      method: "GET",
    }));
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("oauthsignin (#51)", () => {
  it("encodes the nested redirect value and requires CLIENT_ID", async () => {
    const evil = "https://cad.onshape.com/workspace/xyz&client_id=evil#frag";
    const res = await oauthsignin(makeRequest({
      method: "GET",
      query: "redirectOnshapeUri=" + encodeURIComponent(evil),
      url: "http://localhost/oauthsignin?redirectOnshapeUri=" + encodeURIComponent(evil),
      headers: { host: "localhost" },
    }));
    expect(res.status).toBe(302);
    const location = res.headers?.["Location"] ?? "";
    const outer = new URL(location);
    expect(outer.searchParams.get("client_id")).toBe("test-client");
    const redirectUri = outer.searchParams.get("redirect_uri") ?? "";
    const nested = new URL(redirectUri);
    expect(nested.searchParams.get("redirectOnshapeUri")).toBe(evil);
  });

  it("fails fast (500) on invalid SERVER_BASE_URL instead of Host fallback", async () => {
    process.env.SERVER_BASE_URL = "http://app.example.com";
    try {
      const res = await oauthsignin(makeRequest({
        method: "GET",
        query: "redirectOnshapeUri=" + encodeURIComponent("https://cad.onshape.com/x"),
        url: "http://localhost/oauthsignin",
        headers: { host: "localhost" },
      }));
      expect(res.status).toBe(500);
      expect(res.body).toBe("server configuration error");
    } finally {
      delete process.env.SERVER_BASE_URL;
    }
  });

  it("rejects a foreign redirect target", async () => {
    const res = await oauthsignin(makeRequest({
      method: "GET",
      query: "redirectOnshapeUri=" + encodeURIComponent("https://evil.example/x"),
      url: "http://localhost/oauthsignin?redirectOnshapeUri=x",
      headers: { host: "localhost" },
    }));
    expect(res.status).toBe(400);
  });
});
