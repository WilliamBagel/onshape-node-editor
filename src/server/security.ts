// Shared server-hardening helpers for issues #38, #39, #45, #49, #51.
//
// All helpers here are pure/local so they can be unit-tested without
// starting the HTTP listener. Env vars are read at call time (not import
// time) so tests can vary them.

import { promises as dns } from "node:dns";
import { isIP } from "node:net";

// ---------------------------------------------------------------------------
// #38 — Onshape host allowlist
// ---------------------------------------------------------------------------
// The only upstream Onshape hosts this server may talk to. `cad.onshape.com`
// serves the API proxy and page/CSS fetches; `api.onshape.com` is accepted
// as well because some generated clients hit it directly.
export const ONSHAPE_API_HOSTS: readonly string[] = Object.freeze([
  "cad.onshape.com",
  "api.onshape.com",
]);

/**
 * Parse a client-supplied Onshape base URL (the `x-server` header value).
 * Returns a normalized URL only when the scheme is https, the host is on
 * the allowlist, there is no userinfo, and no non-standard port is used.
 * Anything else returns null (the caller must refuse it before fetching).
 */
export function parseOnshapeBase(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "443") return null;
  if (!ONSHAPE_API_HOSTS.includes(parsed.hostname.toLowerCase())) return null;
  return parsed;
}

/** Expand an IPv6 literal (with optional :: and embedded IPv4) to 8 groups. */
function parseIpv6Groups(ip: string): number[] | null {
  let addr = ip;
  // Embedded IPv4 (e.g. ::ffff:1.2.3.4) — expand to two hex groups.
  const v4match = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4match) {
    const parts = v4match[1].split(".").map(Number);
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hex = [((parts[0] << 8) | parts[1]).toString(16), ((parts[2] << 8) | parts[3]).toString(16)];
    addr = addr.slice(0, addr.length - v4match[1].length) + hex.join(":");
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (h: string): number[] | null => {
    if (h === "") return [];
    const out = h.split(":").map((g) => parseInt(g, 16));
    if (out.length === 0 || out.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff)) return null;
    return out;
  };
  const head = parseHalf(halves[0]);
  if (head === null) return null;
  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }
  const tail = parseHalf(halves[1]);
  if (tail === null) return null;
  const missing = 8 - (head.length + tail.length);
  if (missing < 1) return null;
  return [...head, ...new Array(missing).fill(0), ...tail];
}

function groupsToIpv4(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/** True when an IPv4/IPv6 address is private, loopback, link-local, CGNAT,
 *  unique-local, multicast or otherwise non-public. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 0) return true; // not an IP literal at all
  const lower = ip.toLowerCase();

  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0) return true; // 0.0.0.0/8 "this host"
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT shared
    if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
    if (a === 192 && b === 2) return true; // TEST-NET-1 192.0.2.0/24 (docs)
    if (a === 198 && b === 18) return true; // benchmarking 198.18.0.0/15
    if (a === 198 && b === 19) return true;
    if (a === 198 && b === 51) return true; // TEST-NET-2 198.51.100.0/24 (docs)
    if (a === 203 && b === 0) return true; // TEST-NET-3 203.0.113.0/24 (docs)
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6
  if (lower === "::" || lower === "::1") return true;
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
  if (lower.startsWith("ff")) return true; // multicast
  const groups = parseIpv6Groups(lower);
  if (groups) {
    // Documentation prefix 2001:db8::/32 — never public.
    if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
    // Site-local fec0::/10 (deprecated, but still reserved).
    if ((groups[0] & 0xffc0) === 0xfec0) return true;
    // NAT64 well-known prefix 64:ff9b::/96 — embedded IPv4 decides.
    if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
      return isPrivateOrReservedIp(groupsToIpv4(groups[6], groups[7]));
    }
    // NAT64 local-use prefix 64:ff9b:1::/48 — always non-public.
    if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 0x0001) return true;
    // 6to4 2002::/16 — embedded IPv4 decides.
    if (groups[0] === 0x2002) {
      return isPrivateOrReservedIp(groupsToIpv4(groups[1], groups[2]));
    }
  }
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateOrReservedIp(mapped[1]);
  return false;
}

/**
 * Resolve a hostname and require every returned address to be public.
 * Fails closed (false) when resolution fails or any address is private.
 * The allowlist check above is the primary defence; this guards against
 * DNS rebinding / poisoned resolvers pointing an allowed name internally.
 */
export async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  try {
    const addresses = await dns.lookup(hostname, {
      all: true,
      verbatim: true,
    });
    if (!addresses.length) return false;
    return addresses.every((a) => !isPrivateOrReservedIp(a.address));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// #45 — CORS (configured origin instead of `*`)
// ---------------------------------------------------------------------------
export const DEFAULT_ALLOWED_ORIGIN = "https://williambagel.github.io";

export function getAllowedOrigins(): Set<string> {
  const raw =
    process.env.ALLOWED_ORIGIN || process.env.CORS_ALLOWED_ORIGIN || "";
  const origins = new Set<string>([DEFAULT_ALLOWED_ORIGIN]);
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (trimmed) origins.add(trimmed);
  }
  return origins;
}

/** Exact-origin match (protocol + host + port) against the allowed set. */
export function isAllowedOrigin(origin: unknown): boolean {
  if (typeof origin !== "string" || origin === "") return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.origin !== origin) return false; // reject paths, users, etc.
  return getAllowedOrigins().has(parsed.origin);
}

export function corsHeadersFor(
  origin: unknown,
): Record<string, string> {
  if (isAllowedOrigin(origin)) {
    return {
      "Access-Control-Allow-Origin": origin as string,
      Vary: "Origin",
    };
  }
  return {};
}

export const SECURITY_HEADERS: Record<string, string> = Object.freeze({
  // Block MIME sniffing of proxied bodies.
  "X-Content-Type-Options": "nosniff",
  // Don't leak the full request URL to third-party referrers.
  "Referrer-Policy": "strict-origin-when-cross-origin",
});

// HSTS / CSP are enforced at the Azure App Service / Front Door layer
// (see docs/server-security.md); the origin server only adds HSTS when the
// request arrived over TLS so local HTTP development still works.
export const HSTS_HEADER = "max-age=31536000; includeSubDomains";

// ---------------------------------------------------------------------------
// #39 — timeouts and body cap
// ---------------------------------------------------------------------------
export function getUpstreamTimeoutMs(): number {
  const raw = Number(process.env.UPSTREAM_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 1000 && raw <= 30_000) return raw;
  return 8_000;
}

export function getMaxBodyBytes(): number {
  const raw = Number(process.env.MAX_BODY_BYTES);
  if (Number.isFinite(raw) && raw > 0) {
    // Policy: 1–5 MB. Clamp configured values into that range.
    return Math.min(Math.max(raw, 1 * 1024 * 1024), 5 * 1024 * 1024);
  }
  return 2 * 1024 * 1024;
}

// ---------------------------------------------------------------------------
// #79 — bounded upstream response bodies
// ---------------------------------------------------------------------------
// fetchWithTimeout only covers the wait for response headers. The body that
// follows must have its own deadline and byte cap, otherwise a slow-trickle
// or huge upstream body holds the socket / OOMs the process.

export class UpstreamBodyError extends Error {
  readonly reason: "timeout" | "oversize";
  constructor(reason: "timeout" | "oversize") {
    super(`upstream body ${reason}`);
    this.name = "UpstreamBodyError";
    this.reason = reason;
  }
}

export function getMaxUpstreamBytes(): number {
  const raw = Number(process.env.MAX_UPSTREAM_BYTES);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.max(raw, 64 * 1024), 20 * 1024 * 1024);
  }
  return 5 * 1024 * 1024;
}

export function getUpstreamBodyTimeoutMs(): number {
  const raw = Number(process.env.UPSTREAM_BODY_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 100 && raw <= 60_000) return raw;
  return getUpstreamTimeoutMs();
}

type BodyStreamLike = {
  getReader?: () => { read: () => Promise<{ done: boolean; value?: unknown }>; cancel?: () => Promise<unknown> | unknown };
  destroy?: () => void;
  [key: string]: unknown;
};

function destroyBodyStream(response: any): void {
  try {
    const body = response?.body as BodyStreamLike | undefined;
    if (!body) return;
    if (typeof body.destroy === "function") body.destroy();
    if (typeof body.getReader === "function") {
      try { void (body as any).reader?.cancel?.(); } catch { /* noop */ }
    }
  } catch { /* noop */ }
}

/** Run `promise` but throw UpstreamBodyError("timeout") after `ms`. */
function withBodyDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new UpstreamBodyError("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Read an upstream response body with a byte cap and a total deadline.
 * Returns a Buffer. Throws UpstreamBodyError("timeout" | "oversize").
 * Streams chunk-by-chunk (never buffers unbounded); cancels/destroys the
 * underlying stream on timeout or oversize.
 */
export async function readBoundedBody(
  response: any,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<Buffer> {
  const maxBytes = options.maxBytes ?? getMaxUpstreamBytes();
  const timeoutMs = options.timeoutMs ?? getUpstreamBodyTimeoutMs();
  const deadline = Date.now() + timeoutMs;
  const remaining = (): number => deadline - Date.now();

  // Fast-fail when the upstream already advertises an oversize body.
  try {
    const lenHeader = response?.headers?.get?.("content-length");
    if (lenHeader != null) {
      const declared = Number(lenHeader);
      if (Number.isFinite(declared) && declared > maxBytes) {
        destroyBodyStream(response);
        throw new UpstreamBodyError("oversize");
      }
    }
  } catch (err) {
    if (err instanceof UpstreamBodyError) throw err;
    // header inspection must never break the read — continue to streaming
  }

  const body = response?.body as BodyStreamLike | AsyncIterable<unknown> | undefined;
  const chunks: Buffer[] = [];
  let total = 0;
  const push = (chunk: unknown): void => {
    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : chunk instanceof ArrayBuffer
        ? Buffer.from(chunk)
        : chunk instanceof Uint8Array
          ? Buffer.from(chunk)
          : typeof chunk === "string"
            ? Buffer.from(chunk)
            : Buffer.from(String(chunk));
    total += buf.length;
    if (total > maxBytes) {
      destroyBodyStream(response);
      throw new UpstreamBodyError("oversize");
    }
    chunks.push(buf);
  };

  const now = async (): Promise<{ done: boolean; value?: unknown }> => {
    const ms = remaining();
    if (ms <= 0) throw new UpstreamBodyError("timeout");
    return withBodyDeadline(Promise.resolve(), ms).then(() => {
      if (remaining() <= 0) throw new UpstreamBodyError("timeout");
      return { done: false };
    });
  };

  try {
    if (body && typeof (body as BodyStreamLike).getReader === "function") {
      const reader = (body as BodyStreamLike).getReader!();
      (body as any).reader = reader;
      for (;;) {
        const ms = remaining();
        if (ms <= 0) throw new UpstreamBodyError("timeout");
        const { done, value } = await withBodyDeadline(reader.read(), ms);
        if (done) break;
        push(value);
      }
    } else if (body && typeof (body as any)[Symbol.asyncIterator] === "function") {
      for await (const chunk of body as AsyncIterable<unknown>) {
        if (remaining() <= 0) throw new UpstreamBodyError("timeout");
        push(chunk);
      }
    } else if (response && typeof response.arrayBuffer === "function") {
      const ms = remaining();
      if (ms <= 0) throw new UpstreamBodyError("timeout");
      const buf = await withBodyDeadline(response.arrayBuffer(), ms);
      push(buf);
    } else if (response && typeof response.text === "function") {
      const text = await withBodyDeadline(response.text(), remaining());
      push(text);
    } else if (response && typeof response.json === "function") {
      const value = await withBodyDeadline(response.json(), remaining());
      push(JSON.stringify(value));
    } else {
      throw new Error("unsupported upstream body");
    }
  } catch (err) {
    if (err instanceof UpstreamBodyError) {
      destroyBodyStream(response);
      throw err;
    }
    throw err;
  }
  void now;
  return Buffer.concat(chunks);
}

export async function readBoundedText(
  response: any,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string> {
  const buf = await readBoundedBody(response, options);
  return buf.toString("utf8");
}

export async function readBoundedJson<T = unknown>(
  response: any,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<T> {
  const text = await readBoundedText(response, options);
  return JSON.parse(text) as T;
}

/** Fetch with an AbortController deadline. Never leaves a hung upstream. */
export async function fetchWithTimeout(
  fetchFn: (
    url: string,
    options: any,
  ) => Promise<any>,
  url: string,
  options: any,
  timeoutMs: number = getUpstreamTimeoutMs(),
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// #51 — OAuth redirect validation + canonical base URL
// ---------------------------------------------------------------------------
export function isAllowedRedirectOnshapeUri(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.trim() === "") return false;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== "443") return false;
  return ONSHAPE_API_HOSTS.includes(parsed.hostname.toLowerCase());
}

export class InvalidBaseUrlError extends Error {
  constructor() {
    super("invalid SERVER_BASE_URL");
    this.name = "InvalidBaseUrlError";
  }
}

/**
 * Canonical public base URL for OAuth redirects.
 *
 * - Unset → null (caller may fall back to Host headers).
 * - Set but invalid (unparseable, userinfo, non-https off-loopback) → throws
 *   InvalidBaseUrlError so misconfiguration fails fast instead of minting
 *   redirects from spoofable Host/X-Forwarded-* headers (#80).
 */
export function getCanonicalBaseUrl(): string | null {
  const raw =
    process.env.SERVER_BASE_URL || process.env.CANONICAL_BASE_URL || "";
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InvalidBaseUrlError();
  }
  if (parsed.username || parsed.password) throw new InvalidBaseUrlError();
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
    parsed.hostname.toLowerCase(),
  );
  if (parsed.protocol === "https:") return parsed.origin;
  if (parsed.protocol === "http:" && loopback) return parsed.origin;
  throw new InvalidBaseUrlError();
}
