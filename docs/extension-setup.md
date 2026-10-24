# Extension setup: registration and deployment

This is the human-facing setup document for `onshape-node-editor`. It covers what
the extension is, how to register it in the Onshape developer portal, which OAuth
scopes it uses and why, every environment variable the server reads, the full
OAuth flow, local development, the GitHub Pages deploy, the Azure Functions
deploy, a verification checklist, and an explicit list of what cannot be verified
from this repository.

Every value below is cited to the file and line it was read from. Where the
Onshape portal or Azure is the only source of truth, that is stated and you are
told what to check there — no invented click paths. Values that are secret are
redacted; only key names appear.

Repo layout and command traps are in `AIREADME.md`; the rules that constrain the
code are in `docs/design-rules.md`.

---

## 1. What the extension is and where it runs

The app is an **Onshape app extension**: a Vue 3 + Rete page that Onshape loads in
an **iframe inside a document tab**, next to a Part Studio / Assembly
(`AIREADME.md:10-14`). It is not a standalone web app, even though it is built
and deployed as a static site.

Three consequences, all visible in the code:

1. **The document context arrives as query parameters on the iframe URL.**
   `BaseApp.init()` parses `window.location.search` and copies every `key=value`
   into a config object, then caches `documentId`, `workspaceId`, `elementId`
   (`src/app/common/baseapp.ts:299-314`, `:341-343`). Onshape supplies those
   three ids; nothing in the client can invent them.
2. **The OAuth authorization code arrives the same way**, as `code=` on the
   redirect back to the app. `OnshapeAPI.init()` forwards `this.code` to the
   server (`src/app/common/onshapeapi.ts:278`). Opened standalone (dev server,
   direct URL) there is no `code`, the token exchange fails and the app cannot
   make an API call. That is the origin of DR-001's "only works embedded"
   (`docs/design-rules.md:22-23`).
3. **Communication with the host page is `postMessage`.** `ClientMessaging`
   registers a `message` listener and posts `applicationInit` on construction
   (`src/app/onshape-utils/clientmessaging.ts:59-60`, `:119-122`, `:129`), and
   receives Onshape messages at `:138`. There is no parent frame when the page is
   opened directly, so the channel is dead there — the same DR-001 constraint.

The page itself decides between "embedded" and "dev" at startup:
`src/app/main.ts:7-19` checks `process.env.NODE_ENV`; in development it calls
`initDev()` + `startVueApp(true)` and returns, so the dev server renders the UI
only and never touches OAuth.

Because the app is iframed, the OAuth handshake **must leave the iframe**: the
browser is navigated to `oauth.onshape.com`, then back to the deployed site URL
(`public/redirect.html:17-18`, `src/server/oauthsignin.ts:54`). That deployed URL
is `myclient` (§2), and it must be a real, publicly reachable site — not
`localhost`.

---

## 2. Developer-portal registration

Portal: the Onshape developer portal (`https://dev-portal.onshape.com/`, referred
to as the "Onshape Developer Portal" in the generated client's own docs —
`node_modules/onshape-typescript-fetch/apis/DocumentApi.ts:5`). The portal is the
only source of truth for the registration itself; this repo records the *values*
it expects, not the registration.

### 2.1 Field table

| Portal field | Value this repo expects | Where the value comes from / why |
|---|---|---|
| App name | `onshape-node-editor` | `package.json:2` (`"name"`). Cosmetic, but keep it equal to the repo name so portal entries are identifiable. |
| Application kind | An Onshape **app extension** (iframe action URL) **and** an OAuth2 **confidential** application (authorization-code grant with a client secret) | The extension supplies `documentId`/`workspaceId`/`elementId` to the iframe (§1); the token exchange is performed server-side and requires `CLIENT_SECRET` (`src/server/oauth.ts:62-77`). If the portal models these as separate registrations, both are needed. Exact radio labels are portal-side — verify them there. |
| OAuth client id | the value of `CLIENT_ID` in `src/server/.env` | Read at `src/server/config.ts:3`, used at `src/server/oauth.ts:36`, embedded in the authorize URL at `src/server/oauthsignin.ts:54`, and required as a `client_id` query parameter by `public/redirect.html:8`. |
| OAuth client secret | the value of `CLIENT_SECRET` in `src/server/.env` | Read at `src/server/config.ts:4` and `src/server/oauth.ts:37`; posted to the token endpoint at `src/server/oauth.ts:65`. **Never** enters the client bundle — only the Functions app has it. |
| Token endpoint (`CLIENT_URL`) | `https://oauth.onshape.com/oauth/token` | `CLIENT_URL` is read at `src/server/config.ts:5` and `src/server/oauth.ts:35`, and used as the POST target at `src/server/oauth.ts:71`. Its value in `src/server/.env` is redacted here — confirm it is the token endpoint on the same host as the authorize URL that `src/server/oauthsignin.ts:54` builds (`oauth.onshape.com`). |
| Redirect URI (registered) | `https://williambagel.github.io/onshape-node-editor/?documentId=<documentId>&workspaceId=<workspaceId>&elementId=<elementId>` | Reconstructed client-side at `src/app/common/onshapeapi.ts:266-272`; the comment at `:269` says it "must match EXACTLY what is put into the ActionURL `redirect_uri` for the extension". The same string is built in the static page at `public/redirect.html:17`. Onshape appends the three ids; the portal therefore has to accept query parameters on the registered redirect URI — **check that in the portal**, because a strict exact-match registration cannot express the interpolated ids. |
| Action URL / junction URL | `https://williambagel.github.io/onshape-node-editor/redirect.html?client_id=<CLIENT_ID>` | `public/redirect.html` is the only file that turns a portal `client_id` plus the three document ids into an `oauth.onshape.com/oauth/authorize` URL (`public/redirect.html:7-18`). It is copied verbatim into the deployed site (`vite.config.ts:27` sets `publicDir`, and `dist/app/redirect.html` exists after `pnpm run build:app`). It rejects the request if any of `client_id`, `documentId`, `workspaceId`, `elementId` is missing (`public/redirect.html:13-15`), so all four must arrive in the action URL. Onshape supplies the three ids; the `client_id` has to be in the registered URL itself — confirm that in the portal. |
| OAuth scopes | `OAuth2Read`, `OAuth2Write` | Traced call-by-call in §3. Nothing in `src/` resolves to `OAuth2Delete`, `OAuth2Purchase`, `OAuth2ReadPII` or `OAuth2Share`. |
| Extension location | Part Studio (and any document tab where a custom feature will be inserted) | The product path writes FeatureScript into a Feature Studio and inserts the generated feature into a Part Studio (`AIREADME.md:10-14`). The app itself only needs the document context. |

### 2.2 `myserver` and `myclient`

Both are hardcoded class fields in `src/app/app.ts`:

```
src/app/app.ts:50  public myserver = 'https://onshape-node-editor-function.azurewebsites.net';
src/app/app.ts:51  public myclient = 'https://williambagel.github.io/onshape-node-editor';
```

`myserver` is the **Azure Functions host** (`§8`). It is the base for every
server call the client makes:

* token exchange — `this.myserver + '/oauth'` (`src/app/common/onshapeapi.ts:278`)
* token refresh — `this.myserver + '/refresh'` (`src/app/common/onshapeapi.ts:237`)
* REST proxy — `initAPIs()` sets the generated client's `basePath` to
  `myserver + '/api'` and adds an `X-Server` header carrying the real Onshape
  host (`src/app/common/onshapeapi.ts:302-331`)
* file fetcher — `${this.myserver}/getfile?url=…` (`src/app/common/baseapp.ts:151`)

`myclient` is the **deployed static site** (§7). It is used to:

* reconstruct `redirect_uri` (`src/app/common/onshapeapi.ts:272`)
* rewrite font URLs scraped out of Onshape's own CSS
  (`src/app/common/baseapp.ts:228`)

**Why they must be exactly right.** The OAuth token exchange is a redirect-URI
equality check performed by Onshape, not by this repo: the server forwards
whatever `redirect_uri` the client sends (`src/server/oauth.ts:66-68`), and the
client sends one derived from `myclient` (`src/app/common/onshapeapi.ts:272`).
If `myclient` differs from the registered redirect URI by so much as a trailing
slash, the exchange fails and the app shows its failure screen
(`src/app/common/baseapp.ts:282-295`). `myserver` must be the host that holds
`CLIENT_SECRET`, because that is the only place the secret is read
(`src/server/oauth.ts:37`); pointing it at any other host means the exchange is
attempted without credentials and returns `500 {"error":"server configuration
error"}` (`src/server/oauth.ts:52-57`).

### 2.3 Per-environment values

There is exactly one environment wired in the code today — the production pair
above. For a second environment (staging, a fork, a local tunnel):

| | production (as committed) | any other environment |
|---|---|---|
| `myserver` (`src/app/app.ts:50`) | `https://onshape-node-editor-function.azurewebsites.net` | that environment's Functions host |
| `myclient` (`src/app/app.ts:51`) | `https://williambagel.github.io/onshape-node-editor` | that environment's static site root |
| `vite.config.ts:56` `base` | `/onshape-node-editor/` | must match the site's path component of `myclient` |
| `public/redirect.html:17` | hardcodes `https://williambagel.github.io/onshape-node-editor/` | must be edited to the same `myclient` |
| portal registration | `CLIENT_ID`/`CLIENT_SECRET` of the production app | a separate OAuth app, or the same app with the second redirect URI added |

`public/redirect.html:17` hardcoding the production site is a real limitation:
changing environments means editing that file as well as `app.ts`. It is
documented here rather than changed (this document is the scope of the change).

---

## 3. OAuth scopes

The app needs **`OAuth2Read` and `OAuth2Write`**. That is derived from the
operations the app actually performs, not from the portal's checklist:

| Scope | Why it is needed | Call site → scope declaration |
|---|---|---|
| `OAuth2Read` | read the document, its elements, and the standard-library Feature Studio | `documentApi.getDocument` (`src/app/app.ts:84`) → `DocumentApi.ts:832`/`getDocumentRaw` `OAuth2Read`; `documentApi.getElementsInDocument` (`src/app/onshape-utils/appstorage.ts:117`) → `DocumentApi.ts:1124` `OAuth2Read`; `featureStudioApi.getFeatureStudioSpecs` (`src/app/app.ts:89`) is declared `OAuth2Write` upstream (see note) |
| `OAuth2Read` | read app-element JSON | `appElementApi.getJson` (`src/app/onshape-utils/appstorage.ts:445`) → `AppElementApi.ts:1298` `OAuth2Read` |
| `OAuth2Read` | commit an app-element transaction | `appElementApi.commitTransactions` (`src/app/onshape-utils/appstorage.ts:243`) → `AppElementApi.ts:500` `OAuth2Read` |
| `OAuth2Read` | global tree node lookup used by `AppStorage` | `globalTreeNodesApi.globalTreeNodesMagic` (`src/app/onshape-utils/appstorage.ts:300`) → `GlobalTreeNodesApi.ts:533` `OAuth2Read` |
| `OAuth2Read` | the generic "call a URL Onshape handed back" path | `OnshapeAPI.OnshapeRequest` requests `['OAuth2Read']` (`src/app/common/onshapeapi.ts:637-640`) |
| `OAuth2Write` | create the settings document / app element | `documentApi.createDocument` (`src/app/onshape-utils/appstorage.ts:382`) → `DocumentApi.ts:473` `OAuth2Write`; `appElementApi.createElement` (`src/app/onshape-utils/appstorage.ts:426`) → `AppElementApi.ts:625` `OAuth2Write` |
| `OAuth2Write` | write app-element JSON (JSON-patch replace) | `appElementApi.updateAppElement` (`src/app/onshape-utils/appstorage.ts:170`, `:228`) → `AppElementApi.ts:1821` `OAuth2Write` |
| `OAuth2Read` + `OAuth2Write` | start an app-element transaction | `appElementApi.startTransaction` (`src/app/onshape-utils/appstorage.ts:202`) → `AppElementApi.ts:1768` `["OAuth2Read","OAuth2Write"]` |

Notes that matter when you fill in the portal:

* The generated client's scope strings are exactly `OAuth2Read`, `OAuth2Write`,
  `OAuth2Delete`, `OAuth2Purchase`, `OAuth2ReadPII`, `OAuth2Share` (the complete
  set of `accessToken("OAuth2", […])` calls in
  `node_modules/onshape-typescript-fetch/apis/*.ts`). Only the first two are
  reachable from this repo's call sites.
* `getFeatureStudioSpecs` being declared `OAuth2Write` is an upstream quirk; the
  app calls it as a read (`src/app/app.ts:89`). Registering `OAuth2Write` covers
  it either way.
* The `accessToken` callback in this repo ignores the scope argument entirely —
  it returns the same bearer token regardless
  (`src/app/common/onshapeapi.ts:310-312`). So the scopes are fixed at
  authorization time by the portal registration; a missing scope shows up as a
  401/403 from Onshape on the first call, and the first call is
  `getDocument` for the standard library (`src/app/app.ts:82-99`).
* `UserInfo` is constructed at every startup (`src/app/app.ts:35`, `:45`) and
  persists into an Onshape app element (`src/app/onshape-utils/appstorage.ts:160-186`),
  so `OAuth2Write` is exercised on a normal first run, not only on an explicit
  save. (`AIREADME.md:146-148` still calls `UserInfo` "never instantiated" —
  that part of the file map is stale; the constructor call is at `app.ts:35`.)

---

## 4. Server environment variables

Values are secret and redacted. These are the key names the code actually reads
(`git grep -n "process.env" -- src/server`):

```
src/server/config.ts:1:export const ENABLE_LOG = process.env.ENABLE_LOG === '1' || process.env.ENABLE_LOG === 'true';
src/server/config.ts:2:export const LOG_FILENAME = process.env.LOG_FILENAME || 'server.log';
src/server/config.ts:3:export const CLIENT_ID = process.env.CLIENT_ID || '';
src/server/config.ts:4:export const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
src/server/config.ts:5:export const CLIENT_URL = process.env.CLIENT_URL || ''; // token endpoint
src/server/config.ts:6:export const APP_NAME = process.env.APP_NAME || '';
src/server/oauth.ts:35:const CLIENT_URL = process.env.CLIENT_URL;
src/server/oauth.ts:36:const CLIENT_ID = process.env.CLIENT_ID;
src/server/oauth.ts:37:const CLIENT_SECRET = process.env.CLIENT_SECRET;
```

### 4.1 `src/server/.env` (the Functions app)

| Key | Purpose | Read at | Status in the current file |
|---|---|---|---|
| `CLIENT_ID` | OAuth client id used in the token and refresh grants and in the authorize redirect | `src/server/config.ts:3`, `src/server/oauth.ts:36`, `src/server/oauthsignin.ts:33` | present (redacted) |
| `CLIENT_SECRET` | OAuth client secret, server-side only | `src/server/config.ts:4`, `src/server/oauth.ts:37` | present (redacted) |
| `CLIENT_URL` | OAuth **token** endpoint that grants are POSTed to | `src/server/config.ts:5`, `src/server/oauth.ts:35`, `src/server/refresh.ts:33` | present (redacted) |
| `APP_NAME` | App display name | `src/server/config.ts:6` | present (redacted); no consumer found — `git grep APP_NAME -- src scripts` returns only `config.ts:6` and the unrelated `AZURE_FUNCTIONAPP_NAME`. Currently dead. |
| `ENABLE_LOG` | Logging switch | `src/server/config.ts:1` | present (redacted); no consumer found — dead. |
| `LOG_FILENAME` | Log file name, defaults to `server.log` | `src/server/config.ts:2` | **absent** from the file, so the default applies; no consumer found — dead. |

If any of `CLIENT_URL`, `CLIENT_ID`, `CLIENT_SECRET` is empty, the token
endpoint answers `500 {"error":"server configuration error"}`
(`src/server/oauth.ts:52-57`); nothing else validates them.

`.env` loading is `require('dotenv').config()` at `src/server/oauth.ts:33`,
`src/server/api.ts:34`, `src/server/oauthsignin.ts:34` and
`src/scripts`-side `scripts/deployServer.cjs:5`. `refresh.ts` and `getfile.ts`
do not load dotenv themselves; `refresh.ts:33` imports `./config`, whose
module-level constants are therefore only populated because `oauth.ts` (imported
earlier in `src/server/index.ts:2-6`) ran dotenv first. Keep that import order if
you touch `index.ts`.

### 4.2 Repository-root `.env` (deploy only)

Read by `scripts/deployServer.cjs:10-12`, required by `:14-17`:

| Key | Purpose |
|---|---|
| `AZURE_PUBLISH_USER` | SCM/publish username for zip deploy (falls back to `AZURE_USERNAME`, `:10`) |
| `AZURE_PUBLISH_PASS` | SCM/publish password (falls back to `AZURE_PASSWORD`, `:11`) |
| `AZURE_FUNCTIONAPP_NAME` | Functions app name; the SCM host becomes `<name>.scm.azurewebsites.net` (`:44`) |

Both `.env` files are gitignored (`/.gitignore:31` lists `.env`), so a clean
checkout has neither and you must create them.

**Leak warning that is currently true:** `scripts/copyServerAssets.cjs:38-42`
copies `src/server/.env` into `dist/server/.env` if it exists, and
`scripts/deployServer.cjs:39-41` zips the whole of `dist/server` and uploads it.
So the client secret is shipped to the Functions app inside the deployment
package (verified: `dist/server/.env` exists after `pnpm run build:server`). The
correct place for these values in Azure is **Application Settings**; because
`dotenv` only fills keys that are *not* already in `process.env`
(`dotenv` default behaviour), Application Settings win at runtime. Treat the
zipped `.env` as a leak surface: do not build-and-publish with a real secret on a
machine you do not trust, and rotate the secret if a `dist/` tree escapes.

---

## 5. The OAuth flow, step by step

Files: `public/redirect.html` (portal entry), `src/app/main.ts`,
`src/app/common/baseapp.ts`, `src/app/common/onshapeapi.ts`,
`src/app/common/oauth.ts` (client HTTP), `src/server/oauth.ts`,
`src/server/refresh.ts`, `src/server/api.ts`, `src/server/getfile.ts`.

1. **Onshape opens the Action URL in the iframe** with `documentId`,
   `workspaceId`, `elementId` on the query string. The URL must be
   `…/redirect.html?client_id=<CLIENT_ID>` (§2.1).
2. **`public/redirect.html` starts the authorization.** It reads the four
   parameters (`:7-11`), errors out if any is missing (`:13-15`), then builds
   `https://oauth.onshape.com/oauth/authorize?response_type=code&client_id=…&redirect_uri=…`
   where `redirect_uri` is `https://williambagel.github.io/onshape-node-editor/?documentId=…&workspaceId=…&elementId=…`
   (`:17`), and navigates the whole window there (`:18`). The user consents.
3. **Onshape redirects back to that `redirect_uri` with `code=` appended.** This
   is the exact string the client will later reconstruct
   (`src/app/common/onshapeapi.ts:266-272`); the comment there pins the
   requirement.
4. **The page boots** (`src/app/main.ts:18` → `app.init()`).
   `BaseApp.init()` (`src/app/common/baseapp.ts:299-350`) parses the query string
   into `config`, honours a `redirectOnshapeUri` bounce if a server-mediated
   login was used (`:316-321`), builds `new OnshapeAPI(config)` (`:336`), caches
   the three ids (`:341-343`), and waits for `onshape.init()` (`:345`) before
   calling `initApp()` (`:348`).
5. **The client asks the server to exchange the code.**
   `OnshapeAPI.init()` rebuilds `redirect_uri` (`:272`) and calls
   `ExchangeToken(myserver + '/oauth', redirect_uri, code)` (`:278`). The client
   helper issues
   `GET <myserver>/oauth?code=…&redirect_uri=…`
   (`src/app/common/oauth.ts:36-64`, URL built at `:43-48`).
6. **The server performs the token request.**
   `src/server/oauth.ts:39-109`: reads `code` and `redirect_uri` (`:40-41`),
   400 on a missing code (`:44-49`), 500 if config is incomplete (`:52-57`),
   then POSTs a form-encoded `grant_type=authorization_code` with
   `client_id`, `client_secret` and the echoed `redirect_uri` to `CLIENT_URL`
   (`:61-77`), and returns Onshape's JSON with `Access-Control-Allow-Origin: *`
   and no-cache headers (`:82-94`).
7. **The client stores the tokens in memory and rebuilds its API clients.**
   `initAPIs()` (`src/app/common/onshapeapi.ts:296-373`) assigns `access_token`,
   `refresh_token` and an absolute expiry (`:304-306`), sets `basePath` to
   `myserver + '/api'` (`:309`, `:328`), installs the `accessToken` callback
   (`:310-312`), adds the `X-Server` header (`:313`), and constructs every
   generated API object (`:333-372`). Storage is in-memory fields only
   (`:123-125`) — nothing is written to `localStorage` or cookies, so a page
   reload runs the whole handshake again from the `code` in the URL.
8. **API calls go through the proxy.** A generated client call targets
   `<myserver>/api/…`; the `api` function forwards it to
   `<X-Server>/api/…` (`src/server/api.ts:58-60`), preserving method, body and
   all non-hop-by-hop headers including `Authorization` (`:62-107`), and returns
   the upstream body with `Proxy-Url` set and `Access-Control-Allow-Origin: *`
   (`:146-154`). Note it returns upstream error bodies as plain text
   (`:126-141`) — callers must read text, not assume JSON (`AIREADME.md:185-186`).
9. **Token refresh.** Before each authorized call, `getAccessToken()`
   (`src/app/common/onshapeapi.ts:233-261`) checks the expiry and, if passed,
   calls `RefreshToken(myserver + '/refresh', refresh_token)` (`:237`) and
   replaces the pair (`:242-246`). The server side is
   `src/server/refresh.ts:35-66`: it takes the refresh token, POSTs
   `grant_type=refresh_token` with `client_id`/`client_secret` to `CLIENT_URL`
   (`:51-61`) and returns the JSON.
10. **Two independent assets use other endpoints.** `getfile`
    (`src/server/getfile.ts:35-90`, used via
    `src/app/common/baseapp.ts:148-165`) fetches arbitrary http(s) URLs (Onshape
    CSS, thumbnails) so the iframe can restyle itself; `oauthsignin`
    (`src/server/oauthsignin.ts:36-57`) is a *server-mediated* authorization
    redirect that bounces back through `?redirectOnshapeUri=` (honoured at
    `src/app/common/baseapp.ts:316-321`). `oauthsignin` is registered
    (`src/server/index.ts:21-25`) but **no client code calls it** — it is an
    unused alternative to `public/redirect.html`.

### 5.1 Refresh is broken as wired — verified defect, documented not fixed

The client sends the refresh token in a parameter named `code`, as a **GET**:

```
src/app/common/oauth.ts:72   let url = server + '?code=' + encodeURIComponent(code);
src/app/common/oauth.ts:74   xhr.open('GET', url, true);
```

The server reads `refresh_token` (or `refreshToken`), and the function is
registered for **POST only**:

```
src/server/refresh.ts:37     const refresh_token = qs ? (qs.get('refresh_token') || qs.get('refreshToken')) : undefined;
src/server/index.ts:27-31    app.http("refresh", { methods: ["POST"], … })
```

So the first time an access token expires, the refresh round trip answers
`400 "missing refresh token"` (or a method-routing failure) and the app fails via
`failApp` (`src/app/common/onshapeapi.ts:250-256`). This is outside issue #19's
scope; it is listed here because a reader following this document *will* hit it
after roughly one token lifetime, and would otherwise waste a session debugging
their registration. Also note `OnshapeAPI.refreshtoken()`
(`src/app/common/onshapeapi.ts:215-228`) is a separate, unused GET that parses
the response as XML; `getAccessToken()` is the path that actually runs.

---

## 6. Local development setup

Prerequisites, from the repo itself:

* Node `^20.19.0 || >=22.12.0` (`package.json:6-8`); CI uses Node 22
  (`.github/workflows/deploy-production.yml:22-25`).
* pnpm **11.5.2** — pinned in CI (`.github/workflows/deploy-production.yml:27-30`)
  and present as a dependency (`package.json:37`). On a machine without a global
  pnpm, the repo's own binary works: `./node_modules/.bin/pnpm` (verified
  `pnpm -v` → `11.5.2`).
* Port 5173 is the dev-server default; the committed VS Code launch entry points
  at `http://localhost:5173/onshape-node-editor/` (`.vscode/launch.json`,
  `url` field), which matches Vite's `base` of `/onshape-node-editor/`
  (`vite.config.ts:56`).

### 6.1 From a clean checkout

```bash
git clone https://github.com/WilliamBagel/onshape-node-editor.git
cd onshape-node-editor

# REQUIRED form of the install. A plain `pnpm install` aborts with
# ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY when node_modules/ exists as
# (mostly) empty directories, because pnpm refuses to purge them without a TTY.
# See AIREADME.md:38-42 and tmp/HANDOFF.md ("W1 toolchain").
CI=true pnpm install

pnpm run dev            # vite dev server, http://localhost:5173/onshape-node-editor/
pnpm run build:app      # vite build -> dist/app
pnpm run build:server   # tsc -p tsconfig.server.json -> dist/server-src,
                        # then scripts/copyServerAssets.cjs assembles dist/server
pnpm run type-check:gate # the gate: 0 errors under src/**, exits 0
```

`pnpm run type-check` (raw `vue-tsc --build`) is **not** the gate: it exits
non-zero on 25 errors inside the `onshape-typescript-fetch` dependency, which
`scripts/typecheck-gate.mjs` exempts. Do not chase those and do not try to
silence them (`AIREADME.md:102-113`).

### 6.2 What `pnpm run dev` can and cannot test

`src/app/main.ts:7-16`: when `NODE_ENV === 'development'` the app calls
`initDev()` (loads Onshape's CSS from `./onshape/*.css`,
`src/app/common/baseapp.ts:111-140`) and `startVueApp(true)`, then returns. That
means:

* **Yes:** layout, Rete canvas, node/socket rendering, control components,
  tooltips — everything that is pure UI.
* **No:** OAuth, any Onshape API call, document context, app-element persistence.
  There is no `code` parameter and no parent frame, so `OnshapeAPI` is never
  initialized and `ClientMessaging`'s channel is dead.
* **Never:** treat `ClientMessaging.requestSelection()` as working in dev — it is
  debug-only and embedded-only by rule (`docs/design-rules.md:10-43`, the rule
  comment is also on the method at
  `src/app/onshape-utils/clientmessaging.ts:69-75`).

To exercise the real OAuth path locally you need (a) a publicly reachable HTTPS
URL for the built app, (b) `myclient` (`src/app/app.ts:51`) and the hardcoded URL
in `public/redirect.html:17` changed to it, (c) `vite.config.ts:56` `base`
matching its path, and (d) that URL registered as the redirect URI in the portal.
A localhost URL will not satisfy the registration. The practical route is to
deploy to Pages (§7) and test there.

---

## 7. Pages deployment

`.github/workflows/deploy-production.yml`:

* triggers on **push to `master`** (`:3-6`) — the default branch; the file used
  to watch `main` and was fixed in commit `e8a324e` — plus `workflow_dispatch`
  (`:7`)
* Node 22 (`:22-25`), pnpm 11.5.2 (`:27-30`), pnpm store cache (`:32-44`)
* `pnpm install --frozen-lockfile` (`:46-47`)
* `pnpm run build:app` (`:49-50`) → `dist/app` (`vite.config.ts:46-49`)
* `actions/configure-pages@v5`, upload `./dist/app`, `actions/deploy-pages@v4`
  (`:52-62`)

Verified green:

```
$ gh run list --workflow deploy-production.yml --limit 3
completed  success  Deploy to GitHub Pages (Production)  Deploy to GitHub Pages (Production)  wt/w4-deploy-trigger  workflow_dispatch  40009082077  44s  2026-10-23T19:08:52Z
completed  success  Deploy to GitHub Pages (Production)  Deploy to GitHub Pages (Production)  master                workflow_dispatch  27397449076  44s  2026-06-12T05:52:17Z
completed  success  Deploy to GitHub Pages (Production)  Deploy to GitHub Pages (Production)  master                workflow_dispatch  27397287138  43s  2026-06-12T05:47:50Z

$ gh run view 40009082077 --json headBranch,event,conclusion,url
{"conclusion":"success","event":"workflow_dispatch","headBranch":"wt/w4-deploy-trigger",
 "url":"https://github.com/WilliamBagel/onshape-node-editor/actions/runs/40009082077", …}
```

Note precisely what that proves: the workflow succeeds, but run `40009082077` was
a **`workflow_dispatch` on branch `wt/w4-deploy-trigger`**, not a `push` to
`master`. The push trigger is configured (`:3-6`) and the two June runs were
`master` dispatches; no *push*-triggered run appears in the last three. Confirm
with `gh run list --workflow deploy-production.yml --event push` after the next
real push.

Live checks (this session):

```
$ curl -o /dev/null -w '%{http_code}' -L https://williambagel.github.io/onshape-node-editor/
200
$ curl -o /dev/null -w '%{http_code}' -L https://williambagel.github.io/onshape-node-editor/redirect.html
200
```

**The deployed site URL must equal `myclient`.** Vite's `base` is
`/onshape-node-editor/` (`vite.config.ts:56`), so the site is served at
`https://<user>.github.io/onshape-node-editor/`; `myclient`
(`src/app/app.ts:51`) is exactly that, and the redirect URI the client rebuilds
from it (`src/app/common/onshapeapi.ts:272`) is the one the portal must accept
(§2). Change any one of the three — base path, `myclient`, registration — and the
token exchange fails with a redirect-URI mismatch that shows up only as a failed
`/oauth` call in DevTools.

`pnpm run deploy:app` is the manual alternative, and it now does what the
workflow does: it dispatches `deploy-production.yml` for the current branch
(`scripts/deployApp.cjs`), refusing unless the working tree is clean and HEAD is
already on `origin/<branch>` — the workflow is dispatched against a ref on
GitHub, so publishing from an unpushed branch would either fail or publish an
older commit than the one you tested.

**Correction (2026-10-24), verified empirically.** This file previously said
`deploy:app` ran `gh-pages -d dist/app` and that "both paths publish the same
`dist/app`". That was wrong. This repository's Pages site is published from an
Actions **artifact** (`build_type: workflow`), so a `gh-pages` branch is never
served: the file it contains (`assets/index-Cuiwaz1v.js`) returns **404** on the
live site, which serves `assets/index-DhIBBCrA.js` from the last workflow run
(`40009082077`, a `workflow_dispatch` on `wt/w4-deploy-trigger`, sha `e8a324e`).
Pushing build output to that branch is a silent no-op — it looks like a deploy
and publishes nothing, which is exactly what happened before this correction.

No secrets are involved in the Pages build: the app bundle contains only the two
public URLs from `src/app/app.ts:50-51`.

---

## 8. Azure Functions deployment

### 8.1 What `pnpm run build:server` produces

`package.json:13` runs `tsc -p tsconfig.server.json && node ./scripts/copyServerAssets.cjs`.

* `tsconfig.server.json:5` sets `outDir: dist/server-src`, `rootDir: src/server`,
  `module: CommonJS` (`:4`) — so `dist/server-src/*.js` are the compiled
  handlers (`api.js`, `config.js`, `getfile.js`, `index.js`, `oauth.js`,
  `oauthsignin.js`, `redirect.js`, `refresh.js`).
* `scripts/copyServerAssets.cjs` then **assembles the deployable tree** in
  `dist/server`:
  * wipes and recreates `dist/server` (`:26-30`)
  * copies `src/server/host.json` (`:32-36`) — `routePrefix: ""` (`host.json:11-13`),
    which is why the proxy lives at `<myserver>/api/…` and the OAuth endpoints at
    `<myserver>/oauth`, `/refresh`, `/getfile`
  * copies `src/server/.env` if present (`:38-42`) — see the leak warning in §4.2
  * for every `*.function.json` in `src/server`, creates `<name>/` with
    `function.json` and the compiled `<name>.js` renamed to `index.js`
    (`:44-66`), plus the shared `config.js` (`:67-74`) and `config.json` if any
    (`:75-82`)
  * writes a minimal `package.json` with `main: index.js` and dependencies
    `node-fetch@^2.6.7`, `@azure/functions` (taken from the root
    `package.json`), `dotenv` (`:86-107`)
  * copies the compiled registration bundle `dist/server-src/index.js` to
    `dist/server/index.js` (`:109-113`)
  * copies `scripts/server-lock/package-lock.json` to
    `dist/server/package-lock.json` (`:114-117`), or writes a minimal lock if it
    is missing (`:119-133`)

Verified output of a real run in this tree:

```
$ pnpm run build:server
$ tsc -p tsconfig.server.json && node ./scripts/copyServerAssets.cjs
Server assets copied to /home/willi/…/dist/server
exit=0

$ find dist/server -type f | sort
dist/server/api/config.js
dist/server/api/function.json
dist/server/api/index.js
dist/server/.env
dist/server/getfile/config.js
dist/server/getfile/function.json
dist/server/getfile/index.js
dist/server/host.json
dist/server/index.js
dist/server/oauth/config.js
dist/server/oauth/function.json
dist/server/oauth/index.js
dist/server/oauthsignin/config.js
dist/server/oauthsignin/function.json
dist/server/oauthsignin/index.js
dist/server/package.json
dist/server/package-lock.json
dist/server/redirect/config.js
dist/server/redirect/function.json
dist/server/redirect/index.js
dist/server/refresh/config.js
dist/server/refresh/function.json
dist/server/refresh/index.js
```

Two facts about that tree worth knowing before you debug it:

* **The live registration is `dist/server/index.js`.** The Functions v4
  programming model registers handlers at module load
  (`src/server/index.ts:9-39`: `getfile`, `oauth`, `oauthsignin`, `refresh`,
  `api` with `route: "api/{*path}"`). The per-function `function.json` folders
  are legacy v3-layout artifacts emitted by the copy script; they are not what
  registers the routes. If a route 404s, check `index.ts`, not `function.json`.
* **`dist/server/redirect/` is stale.** `src/server/redirect.function.json`
  exists but there is no `src/server/redirect.ts`, and `redirect` is not
  registered in `index.ts`. The copy script's fallback (`:61-65`) copies the TS
  source as `index.js` when no compiled file is found; in this tree
  `dist/server-src/redirect.js` is a leftover from an earlier build, so
  `dist/server/redirect/index.js` is stale compiled JS. It is harmless (never
  routed) but do not read it as evidence of a redirect function.

### 8.2 Why `scripts/server-lock/package-lock.json` is copied

The compiled handlers are CommonJS (`tsconfig.server.json:4`) and
`require("node-fetch")` at the top of every handler
(`src/server/oauth.ts:31`, `refresh.ts:31`, `api.ts:32`, `getfile.ts:32`).
`scripts/copyServerAssets.cjs:96-107` writes a `package.json` that depends on
`node-fetch@^2.6.7`. The root workspace does **not** install `node-fetch`: the
root only carries the typings, `@types/node-fetch@^2.6.13` (`package.json:57`),
because the root build only needs to type-check (`AIREADME.md:78-80`).
`scripts/server-lock/package.json:6` pins `node-fetch: "^2.6.7"` for the
Functions runtime; node-fetch v2 is CommonJS, whereas v3 is ESM-only and cannot
be `require`d by these compiled files.

The lockfile is copied (`:114-117`) so that the `npm ci` that
`scripts/deployServer.cjs:34` runs **inside `dist/server`** is deterministic. That
is the whole reason the file is tracked; `AIREADME.md:48-51` says explicitly not
to delete it.

### 8.3 What `scripts/deployServer.cjs` does

```
pnpm run deploy:server   # package.json:23 -> build:server, then node ./scripts/deployServer.cjs
```

1. Loads the root `.env` (`:5`) and requires
   `AZURE_PUBLISH_USER`, `AZURE_PUBLISH_PASS`, `AZURE_FUNCTIONAPP_NAME`
   (`:10-17`); exits 1 with a message if any is missing.
2. Requires `dist/server` to exist (`:19-22`), otherwise tells you to run
   `npm run build:server` first.
3. Runs `npm ci --no-audit --no-fund --omit=dev` inside `dist/server` (`:24-37`)
   so the runtime `node_modules` — `node-fetch@2`, `@azure/functions`, `dotenv` —
   is materialized from the copied lockfile.
4. Zips the whole directory (`:39-41`) and POSTs it to
   `https://<AZURE_FUNCTIONAPP_NAME>.scm.azurewebsites.net/api/zipdeploy`
   with `Content-Type: application/zip` and HTTP basic auth
   `<user>:<pass>` (`:43-52`).
5. Streams the response and exits with the HTTP status (`:54-67`).

The credentials it wants are the Function App's **SCM / publish** credentials
(Deployment Center → FTPS/publish credentials in the Azure portal), not an AAD
token. They are separate from the OAuth client secret in §4.1.

### 8.4 `.funcignore`

```
.funcignore
node_modules
*.log
dist
src
tests
```

This file is consumed by the Azure Functions **Core Tools**
(`func azure functionapp publish`), not by `scripts/deployServer.cjs` — that
script zips an already-assembled `dist/server` and never looks at `.funcignore`
(`:39-41`). Its contents are consistent with the intended artifact: the thing
you publish is the *contents of* `dist/server`, so the repo's own `dist/`,
`src/`, `tests/` and `node_modules/` must never be uploaded. If you deploy with
Core Tools instead, run it **from `dist/server`**, or the ignore list will strip
the very files you meant to ship.

### 8.5 Azure-side configuration

In the Function App:

* **Application Settings** (Configuration → Application settings):
  `CLIENT_ID`, `CLIENT_SECRET`, `CLIENT_URL`, and optionally `APP_NAME`,
  `ENABLE_LOG` (§4.1). These override the zipped `.env`, because `dotenv` does
  not overwrite keys already present in `process.env`.
* **CORS**: not needed. Every server response sets
  `Access-Control-Allow-Origin: *` (`src/server/oauth.ts:84`,
  `src/server/api.ts:147`, `src/server/getfile.ts:75`), so the browser calls from
  the Pages origin are not blocked by a Functions CORS allow-list. (If you add
  one anyway, the Basic-auth-free anonymous routes must stay anonymous:
  `authLevel: "anonymous"` at `src/server/index.ts:11`, `:17`, `:23`, `:29`, `:36`.)
* **Platform**: Node 20 or 22 to match `package.json:6-8` and the CI Node 22.

The deployment itself is **not** verifiable from this repo — see §10.

---

## 9. Verification checklist

Run top to bottom on a fresh clone. Each row states the command, the expected
result, and the citation for why that is the expected result.

| # | Command / action | Expected | Why |
|---|---|---|---|
| 1 | `node -v` | `v20.19+` or `v22.12+` | `package.json:6-8` |
| 2 | `pnpm -v` (or `./node_modules/.bin/pnpm -v`) | `11.5.2` | CI pin, `.github/workflows/deploy-production.yml:30` |
| 3 | `CI=true pnpm install` | `Already up to date` / `Done in …`, exit 0 | `AIREADME.md:38-42`; verified in this tree: `Already up to date / Done in 305ms using pnpm v11.5.2` |
| 4 | `find node_modules -type f \| wc -l` | thousands, not 0 | `AIREADME.md:169-171` (empty package dirs are a real failure mode) |
| 5 | `pnpm run type-check:gate` | `errors under src/**: 0`, `GATE PASSED`, exit 0 | `scripts/typecheck-gate.mjs`; verified in this tree |
| 6 | `pnpm run build:app` | exit 0; `dist/app/index.html`, `dist/app/redirect.html`, `dist/app/assets/*` | `vite.config.ts:46-56` |
| 7 | `pnpm run build:server` | exit 0; `dist/server/index.js`, `dist/server/package.json`, `dist/server/package-lock.json`, one folder per handler | §8.1; verified in this tree |
| 8 | `node -e "console.log(require('./dist/server/package.json').dependencies)"` | contains `node-fetch: '^2.6.7'` | `scripts/copyServerAssets.cjs:101-105` |
| 9 | `git grep -n "process.env" -- src/server` | the 9 lines quoted in §4 | — |
| 10 | `curl -s -o /dev/null -w '%{http_code}' -L https://williambagel.github.io/onshape-node-editor/` | `200` | verified in this session |
| 11 | `curl -s -o /dev/null -w '%{http_code}' -L https://williambagel.github.io/onshape-node-editor/redirect.html` | `200` | verified in this session; file comes from `public/redirect.html` |
| 12 | `curl -s -o /dev/null -w '%{http_code}' https://onshape-node-editor-function.azurewebsites.net/` | `200` (host is up) | verified in this session; proves the app exists, not that config is right |
| 13 | Open the extension from a Part Studio, DevTools → Network | `GET …/oauth?code=…&redirect_uri=…` → `200` with `access_token`, `refresh_token`, `expires_in`, `scope` | fields at `src/app/common/oauth.ts:28-34`; server at `src/server/oauth.ts:90-94` |
| 14 | In the Network panel, the first API call after init | `GET https://onshape-node-editor-function.azurewebsites.net/api/documents/…` → `200`, response headers include `Proxy-Url` | `src/server/api.ts:154`; the call is `getDocument` from `src/app/app.ts:84` |
| 15 | Console | `Post message received in application extension.` | `src/app/onshape-utils/clientmessaging.ts:138` — proves the iframe channel is live |
| 16 | Console | a `something went wrong` after `UserInfo.init()` | `src/app/app.ts:47-50` — happens when `getUserSettings()` returns null on a fresh user; not a setup failure, the app continues |
| 17 | Wait for token expiry (~1 h), or force `expires_token` into the past | **`400 missing refresh token`** — this is the known defect in §5.1, not a misconfiguration | `src/app/common/oauth.ts:72-74` vs `src/server/refresh.ts:37` |
| 18 | `gh run list --workflow deploy-production.yml --limit 3` | a `success` run for `Deploy to GitHub Pages (Production)` | verified in this session |

If step 13 returns `500 {"error":"server configuration error"}`, the Functions
app is missing `CLIENT_ID`/`CLIENT_SECRET`/`CLIENT_URL` (§4.1). If it returns
`400` with an Onshape error body, the `redirect_uri` did not match the
registration (§2.2). If step 14 returns `401`, the granted scopes are wrong
(§3). If step 15 never prints, the page was opened outside Onshape (§1).

---

## 10. Unverifiable from this repository

These steps cannot be confirmed from the repo, and no amount of reading code
closes them. Each entry says what would count as evidence.

1. **The registration's actual contents** — the registered app name, app type,
   the exact Action URL string, the registered redirect URI(s), and whether the
   app is public/private. Nothing in the repo stores or exports the portal
   configuration; §2.1 gives the values this repo *needs*, not what is
   registered. *Evidence:* a screenshot or export of the portal's application
   page, or a successful end-to-end OAuth round trip (§9 step 13) whose
   `redirect_uri` equals `src/app/common/onshapeapi.ts:272`.
2. **Whether Onshape accepts a query-parameterised redirect URI.** The client
   depends on it (`src/app/common/onshapeapi.ts:266-272`,
   `public/redirect.html:17`), but only the portal can accept or reject it.
   *Evidence:* the portal accepting that exact string, or a token exchange that
   succeeds without `redirect_uri` errors.
3. **Whether `client_id` is delivered to the Action URL.** `public/redirect.html:8,13`
   requires it, and Onshape is not documented in this repo to supply it — it may
   have to be baked into the registered URL. *Evidence:* the actual iframe `src`
   in the browser's DOM (DevTools → Elements), which is the only place the real
   Action URL is visible.
4. **The granted scopes.** The portal decides whether `OAuth2Read`/`OAuth2Write`
   are granted; the token response's `scope` field
   (`src/app/common/oauth.ts:33`) is the evidence, and it is only observable at
   runtime. *Evidence:* the `scope` value in the `/oauth` response.
5. **`CLIENT_URL`'s actual value and validity.** It is redacted here and only
   used at runtime. *Evidence:* the request the Functions app makes, or a
   successful token exchange.
6. **The Azure Function App's Application Settings, runtime version and
   deployment state.** Nothing in the repo records them, and this session did not
   (and must not) deploy with `scripts/deployServer.cjs` — the credentials in the
   root `.env` were not exercised. `curl` proves the host answers `200`
   (`§9` step 12), which is all.
   *Evidence:* `az functionapp config appsettings list -n <name> -g <rg>` (names
   only, never values in a ticket), `az functionapp show` for the runtime, and a
   deployment log or `zipdeploy` status from `scripts/deployServer.cjs:54-58`.
7. **That the deployed bundle matches this commit.** Pages serves whatever the
   last workflow built; no build provenance (commit SHA) is embedded in
   `dist/app`. *Evidence:* the Actions run that produced the live artifact
   (`gh run list`) cross-referenced with the commit being documented.
8. **That a *push* to `master` deploys.** The trigger is configured
   (`.github/workflows/deploy-production.yml:3-6`) but the only verified run
   (`40009082077`) is a `workflow_dispatch` on `wt/w4-deploy-trigger` (§7).
   *Evidence:* a `push`-event run on `master`.
9. **Any second environment.** Only the production pair is in the code
   (`src/app/app.ts:50-51`) and `public/redirect.html:17` hardcodes the
   production origin. A staging setup would need the edits listed in §2.3 plus a
   second portal registration; none of that exists to verify.

Known-verified defect carried in this document rather than fixed (out of scope
for issue #19): the refresh round trip cannot succeed as wired (§5.1). It is
reproducible from the two source files cited there and should get its own issue.
