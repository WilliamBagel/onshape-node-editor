# Server security hardening (issues #38, #39, #45, #49, #51)

Applies to the plain-Node HTTP server in `src/server/` deployed to
Azure App Service.

## Origin server (this repo)

- **CORS** (`src/server/security.ts`): responses echo
  `Access-Control-Allow-Origin` only for the configured Pages origin
  (`ALLOWED_ORIGIN`, comma-separated; default
  `https://williambagel.github.io`). Any other `Origin` gets 403.
  `Access-Control-Allow-Origin: *` is never emitted. Requests without an
  `Origin` header (curl, server-to-server) are unaffected.
- **Security headers** are added by `src/server/index.ts` on every
  response: `X-Content-Type-Options: nosniff` and
  `Referrer-Policy: strict-origin-when-cross-origin`. Over TLS the server
  also adds `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- **SSRF** (`src/server/api.ts`, #38): the `x-server` header must be an
  https URL on `cad.onshape.com` or `api.onshape.com`, with no userinfo or
  non-standard port, and every resolved address must be public. `Cookie`
  and `X-Server` are never forwarded; `Authorization` is forwarded only
  when it is the client's Onshape `Bearer` token. `Proxy-Url` is not
  returned.
- **Limits** (#39): body cap `MAX_BODY_BYTES` (1–5 MB, default 2 MB) with
  413, `UPSTREAM_TIMEOUT_MS` (default 8000) on every upstream fetch,
  `requestTimeout`/`headersTimeout` on the listener, validated `PORT`,
  `EADDRINUSE` handling, and graceful SIGTERM/SIGINT drain.
- **Credentials** (#49): `/refresh` accepts the token only from the POST
  body (form or JSON) and rejects query credentials; `/getfile` forwards
  only `Accept`/`Accept-Language`; token responses carry
  `Cache-Control: no-store`.
- **Leakage** (#51): upstream bodies, error objects and headers
  (including `set-cookie`) are never echoed — detail is logged server-side
  and clients get a generic body. `/oauthsignin` prefers `SERVER_BASE_URL`
  over the `Host` header, validates `redirectOnshapeUri` against the
  Onshape hosts, and requires a non-empty `CLIENT_ID`.

## App Service / Front Door layer

Set these as custom response headers on the Web App (or Front Door rules),
because the origin server only adds HSTS over TLS and does not set a CSP:

| Header | Value | Notes |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforced fleet-wide, including any plain-HTTP edge. |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors *` | The API/token responses are consumed via `fetch`/XHR, not rendered; `frame-ancestors` stays open because the app runs inside an Onshape iframe. For the static Pages site, use a separate, app-appropriate CSP. |
| `X-Content-Type-Options` | `nosniff` | Redundant with the origin header; belt-and-braces at the edge. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Matches the origin server. |

## Environment knobs

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | Pages origin | Comma-separated extra allowed CORS origins. |
| `SERVER_BASE_URL` | unset | Canonical public base URL; when set `/oauthsignin` ignores `Host`. |
| `MAX_BODY_BYTES` | 2 MB | Body cap (clamped to 1–5 MB). |
| `UPSTREAM_TIMEOUT_MS` | 8000 | Upstream fetch deadline (clamped to 1–30 s). |
