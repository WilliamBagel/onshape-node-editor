import { describe, expect, it, vi, afterEach } from "vitest";
import {
  corsHeadersFor,
  fetchWithTimeout,
  getCanonicalBaseUrl,
  getMaxBodyBytes,
  getUpstreamTimeoutMs,
  isAllowedOrigin,
  isAllowedRedirectOnshapeUri,
  isPrivateOrReservedIp,
  parseOnshapeBase,
} from "../security";

describe("parseOnshapeBase (#38)", () => {
  it("accepts the allowlisted https hosts", () => {
    expect(parseOnshapeBase("https://cad.onshape.com")?.hostname).toBe("cad.onshape.com");
    expect(parseOnshapeBase("https://api.onshape.com")?.hostname).toBe("api.onshape.com");
  });
  it("rejects http, userinfo, ports, non-allowlisted hosts", () => {
    expect(parseOnshapeBase("http://cad.onshape.com")).toBeNull();
    expect(parseOnshapeBase("https://user@cad.onshape.com")).toBeNull();
    expect(parseOnshapeBase("https://cad.onshape.com:8443")).toBeNull();
    expect(parseOnshapeBase("https://evil.example.com")).toBeNull();
    expect(parseOnshapeBase("https://169.254.169.254")).toBeNull();
    expect(parseOnshapeBase("not a url")).toBeNull();
  });
  it("rejects the empty default-less cases", () => {
    expect(parseOnshapeBase("")).toBeNull();
    expect(parseOnshapeBase(undefined)).toBeNull();
  });
});

describe("isPrivateOrReservedIp (#38)", () => {
  it("flags loopback, private, link-local and multicast", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1",
      "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::",
      "fe80::1", "fd00::1", "ff02::1"]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(false);
    }
  });
});

describe("CORS (#45)", () => {
  afterEach(() => { delete process.env.ALLOWED_ORIGIN; });
  it("echoes only the allowed origin", () => {
    expect(corsHeadersFor("https://williambagel.github.io")["Access-Control-Allow-Origin"])
      .toBe("https://williambagel.github.io");
    expect(corsHeadersFor("https://evil.example")).toEqual({});
    expect(corsHeadersFor(undefined)).toEqual({});
  });
  it("honours extra configured origins", () => {
    process.env.ALLOWED_ORIGIN = "https://app.example.com";
    expect(isAllowedOrigin("https://app.example.com")).toBe(true);
    expect(isAllowedOrigin("https://app.example.com/path")).toBe(false);
  });
});

describe("limits (#39)", () => {
  afterEach(() => { delete process.env.MAX_BODY_BYTES; delete process.env.UPSTREAM_TIMEOUT_MS; });
  it("defaults body cap to 2 MB and timeout to 8000", () => {
    expect(getMaxBodyBytes()).toBe(2 * 1024 * 1024);
    expect(getUpstreamTimeoutMs()).toBe(8000);
  });
  it("clamps configured values into policy range", () => {
    process.env.MAX_BODY_BYTES = "100";
    expect(getMaxBodyBytes()).toBe(1 * 1024 * 1024);
    process.env.MAX_BODY_BYTES = "99999999";
    expect(getMaxBodyBytes()).toBe(5 * 1024 * 1024);
    process.env.UPSTREAM_TIMEOUT_MS = "20000";
    expect(getUpstreamTimeoutMs()).toBe(20000);
  });
  it("fetchWithTimeout aborts a hung upstream", async () => {
    const hanging = (_url: string, opts: any) =>
      new Promise((_res, rej) => { opts.signal.addEventListener("abort", () => rej(new Error("aborted"))); });
    await expect(fetchWithTimeout(hanging as any, "https://example.com", {}, 50)).rejects.toThrow();
  });
});

describe("oauth redirect validation (#51)", () => {
  it("allows https Onshape hosts only", () => {
    expect(isAllowedRedirectOnshapeUri("https://cad.onshape.com/workspace/xyz")).toBe(true);
    expect(isAllowedRedirectOnshapeUri("https://evil.example.com")).toBe(false);
    expect(isAllowedRedirectOnshapeUri("http://cad.onshape.com")).toBe(false);
    expect(isAllowedRedirectOnshapeUri("https://cad.onshape.com@evil.example")).toBe(false);
  });
  it("canonical base URL prefers config over Host", () => {
    delete process.env.SERVER_BASE_URL;
    expect(getCanonicalBaseUrl()).toBeNull();
    process.env.SERVER_BASE_URL = "https://myapp.azurewebsites.net/";
    expect(getCanonicalBaseUrl()).toBe("https://myapp.azurewebsites.net");
    delete process.env.SERVER_BASE_URL;
  });
  it("encodeURIComponent keeps a break-out value inside one parameter", () => {
    const raw = "https://cad.onshape.com/workspace/xyz&client_id=evil#frag";
    const outer = new URL("https://oauth.onshape.com/oauth/authorize");
    outer.searchParams.set("redirect_uri", `https://app/oauthsignin?redirectOnshapeUri=${encodeURIComponent(raw)}`);
    expect(outer.searchParams.get("redirect_uri")).toContain(`redirectOnshapeUri=${encodeURIComponent(raw)}`);
    expect(outer.searchParams.get("client_id")).toBeNull();
  });
  it("stays buildable with vi mock available", () => { // placeholder to keep import used
    expect(vi).toBeDefined();
  });
});
