// Azure App Service (Web App) entry point (#28).
//
// Plain Node HTTP server on process.env.PORT. Replaces the Azure Functions
// programming model (no host.json, no *.function.json, no @azure/functions):
// the routes below preserve the old registration from the Functions era —
//   GET|POST /getfile, GET|POST /oauth, GET /oauthsignin, POST /refresh,
//   and every method on /api/{*path} (the Onshape API proxy).
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
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
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

function sendResponse(res: ServerResponse, result: HttpResponseInit): void {
  res.statusCode = result.status ?? 200;
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
  }
  const body = result.body;
  if (body === undefined || body === null) {
    res.end();
  } else if (typeof body === "string") {
    res.end(body);
  } else if (body instanceof Error) {
    res.end(body.message);
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
    const route = routes.find((r) => r.matches(pathname));
    if (!route) {
      sendResponse(res, { status: 404, body: "not found" });
      return;
    }
    if (!route.methods.has(method)) {
      sendResponse(res, { status: 405, body: "method not allowed" });
      return;
    }
    const rawBody = await readBody(req);
    const request = toAdapterRequest(req, rawBody);
    const result = await route.handler(request, {});
    sendResponse(res, result);
  } catch (err: any) {
    sendResponse(res, { status: 502, body: String(err?.message || err) });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, () => {
  console.log(`onshape-node-editor server listening on port ${port}`);
});
