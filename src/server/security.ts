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
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6
  if (lower === "::" || lower === "::1") return true;
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
  if (lower.startsWith("ff")) return true; // multicast
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

export function getCanonicalBaseUrl(): string | null {
  const raw =
    process.env.SERVER_BASE_URL || process.env.CANONICAL_BASE_URL || "";
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password) return null;
  return parsed.origin;
}
