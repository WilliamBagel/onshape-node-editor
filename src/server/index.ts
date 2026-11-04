// Azure App Service (Web App) entry point (#28).
//
// Plain Node HTTP server on process.env.PORT. Replaces the Azure Functions
// programming model (no host.json, no *.function.json, no @azure/functions):
// the routes below preserve the old registration from the Functions era —
//   GET|POST /getfile, GET|POST /oauth, GET /oauthsignin, POST /refresh,
//   and every method on /api/{*path} (the Onshape API proxy).
//
// #45: Strict-Transport-Security and Content-Security-Policy are set at
// the Azure App Service / Front Door layer (custom headers configured on
// the Web App), not here — this origin server only adds HSTS over TLS (see
// docs/server-security.md). CORS is restricted to the Pages origin via
// security.ts; never use `*` on these token-bearing routes.
//
// Import order matters: api.ts loads dotenv at module load, and config.ts
// (imported by refresh.ts) reads process.env at import time. Keep api first.

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import api from "./api";
import getfile from "./getfile";
import oauth from "./oauth";
import oauthsignin from "./oauthsignin";
import refresh from "./refresh";
import { HeaderMap, HttpRequest, HttpResponseInit } from "./httpTypes";
import { corsHeadersFor, getMaxBodyBytes, HSTS_HEADER, isAllowedOrigin, SECURITY_HEADERS } from "./security";

type Handler = (request: HttpRequest, context?: any) => Promise<HttpResponseInit>;

interface Route {
  matches(pathname: string): boolean;
  methods: Set<string>;
  handler: Handler;
}

const routes: Route[] = [
  { matches: (p) => p === "/getfile", methods: new Set(["GET", "POST"]), handler: getfile },
  { matches: (p) => p === "/oauth", methods: new Set(["GET", "POST"]), handler: oauth },
  { matches: (p) => p === "/oauthsignin", methods: new Set(["GET"]), handler: oauthsignin },
  { matches: (p) => p === "/refresh", methods: new Set(["POST"]), handler: refresh },
  {
    matches: (p) => p === "/api" || p.startsWith("/api/"),
    methods: new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
    handler: api,
  },
];

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const maxBytes = getMaxBodyBytes();
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      const err: any = new Error("payload too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function toAdapterRequest(req: IncomingMessage, rawBody: Buffer): HttpRequest {
  const headers: HeaderMap = {} as HeaderMap;
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(", ");
  }
  headers.forEach = (callback: (value: string, key: string) => void) => {
    for (const [key, value] of Object.entries(headers)) {
      if (key !== "forEach" && typeof value === "string") callback(value, key);
    }
  };

  const host = headers["host"] || "localhost";
  const proto = headers["x-forwarded-proto"] || "http";
  const requestPath = req.url || "/";

  let body: any = undefined;
  const contentType = headers["content-type"] || "";
  if (rawBody.length > 0) {
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(rawBody.toString("utf8"));
      } catch {
        body = undefined;
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      body = Object.fromEntries(new URLSearchParams(rawBody.toString("utf8")));
    }
  }

  return {
    method: req.method,
    url: `${proto}://${host}${requestPath}`,
    query: new URL(requestPath, "http://localhost").searchParams,
    headers,
    body,
    protocol: proto,
    arrayBuffer: async () =>
      rawBody.buffer.slice(rawBody.byteOffset, rawBody.byteOffset + rawBody.byteLength) as ArrayBuffer,
  };
}

function isTlsRequest(req: IncomingMessage): boolean {
  const proto = req.headers["x-forwarded-proto"] || (req.socket as any)?.encrypted;
  return proto === "https" || proto === true;
}

function sendResponse(req: IncomingMessage, res: ServerResponse, result: HttpResponseInit): void {
  res.statusCode = result.status ?? 200;
  // #45: security headers on every response; CORS echoes only the
  // configured Pages origin (never `*`). Handlers strip their own ACAO.
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    ...corsHeadersFor(req.headers.origin),
  };
  if (isTlsRequest(req)) {
    headers["Strict-Transport-Security"] = HSTS_HEADER;
  }
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      // CORS is authoritative here — drop any ACAO a handler tried to set.
      if (key.toLowerCase() === "access-control-allow-origin") continue;
      headers[key] = value;
    }
  }
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  const body = result.body;
  if (body === undefined || body === null) {
    res.end();
  } else if (typeof body === "string") {
    res.end(body);
  } else if (body instanceof Error) {
    // #51: never leak error objects — log server-side, send a generic body.
    console.error(body);
    res.end("internal error");
  } else if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    res.end(body);
  } else if (body instanceof ArrayBuffer) {
    res.end(Buffer.from(body));
  } else {
    res.end(String(body));
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const method = (req.method || "GET").toUpperCase();
    const origin = req.headers.origin;

    // #45: preflight from the allowed origin only.
    if (method === "OPTIONS") {
      if (origin && !isAllowedOrigin(origin)) {
        sendResponse(req, res, { status: 403, body: "origin not allowed" });
        return;
      }
      res.statusCode = 204;
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
      for (const [k, v] of Object.entries(corsHeadersFor(origin))) res.setHeader(k, v);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Server, Accept, Accept-Language");
      res.setHeader("Access-Control-Max-Age", "86400");
      res.end();
      return;
    }

    // #45: browser callers from any other origin are refused.
    if (origin && !isAllowedOrigin(origin)) {
      sendResponse(req, res, { status: 403, body: "origin not allowed" });
      return;
    }

    const route = routes.find((r) => r.matches(pathname));
    if (!route) {
      sendResponse(req, res, { status: 404, body: "not found" });
      return;
    }
    if (!route.methods.has(method)) {
      sendResponse(req, res, { status: 405, body: "method not allowed" });
      return;
    }
    const rawBody = await readBody(req);
    const request = toAdapterRequest(req, rawBody);
    const result = await route.handler(request, {});
    sendResponse(req, res, result);
  } catch (err: any) {
    if (err?.statusCode === 413) {
      sendResponse(req, res, { status: 413, body: "payload too large" });
      return;
    }
    // #51: log detail server-side; clients get a generic error.
    console.error("request failed", err?.message || err);
    sendResponse(req, res, { status: 502, body: "bad gateway" });
  }
});

// #39: request/headers timeouts so a slow client can't hold a socket open.
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
(server as any).maxHeaderSize = 16 * 1024;

// #39: validate PORT before binding — fail fast on garbage.
const rawPort = process.env.PORT || "8080";
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error(`invalid PORT: ${JSON.stringify(process.env.PORT)}`);
  process.exit(1);
}

server.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`port ${port} is already in use`);
  } else {
    console.error("server error", err?.message || err);
  }
  process.exit(1);
});

// #39: graceful drain on SIGTERM/SIGINT (App Service sends SIGTERM).
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, () => {
  console.log(`onshape-node-editor server listening on port ${port}`);
});
