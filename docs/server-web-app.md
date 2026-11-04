# Server — Azure App Service (Web App)

The server-side code in `src/server/` runs as a **plain Node HTTP server** on
Azure App Service — not an Azure Functions app. There is no `host.json`, no
`*.function.json`, and no `@azure/functions` dependency anywhere in the repo
(`package.json` dependency lists checked; `src/server/index.ts:1-4`,
`src/server/httpTypes.ts:1-4`).

## Build

`pnpm run build:server` (`package.json:13`) runs
`tsc -p tsconfig.server.json && node ./scripts/copyServerAssets.cjs`.

- `tsconfig.server.json:5-6` — TypeScript compiles `src/server/**/*` to
  `dist/server-src/`.
- `scripts/copyServerAssets.cjs:29-56` — copies the compiled `.js` files flat
  into `dist/server/` and writes a minimal `package.json` there with
  `main: index.js`, `scripts.start: node index.js`, and only two runtime
  dependencies (`node-fetch`, `dotenv`).
- `scripts/copyServerAssets.cjs:8-10` — the script never copies any `.env`
  file into the deployment package. Secrets belong in the Web App's
  Application Settings.

## PORT binding

`src/server/index.ts:12` imports `createServer` from `node:http`;
`src/server/index.ts:135-138` listens on `Number(process.env.PORT || 8080)` —
the port Azure App Service injects. The built `dist/server/index.js` is the
startup file (`start: node index.js`).

## Routes

`src/server/index.ts:28-38` routes, all dispatched by the single HTTP server:

| Route | Methods | Handler |
|---|---|---|
| `/getfile` | GET, POST | `src/server/getfile.ts` |
| `/oauth` | GET, POST | `src/server/oauth.ts` |
| `/oauthsignin` | GET | `src/server/oauthsignin.ts` |
| `/refresh` | POST | `src/server/refresh.ts` |
| `/api`, `/api/*` | GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD | `src/server/api.ts` (Onshape API proxy) |

Unknown paths return `404 "not found"`; wrong methods return
`405 "method not allowed"` (`src/server/index.ts:118-125`). Handler errors
become `502` (`src/server/index.ts:130-132`).

## Environment variables (Web App Application Settings)

Read at import time by `src/server/config.ts:1-6` (and directly by
`src/server/oauth.ts:35-37`):

| Variable | Purpose |
|---|---|
| `CLIENT_ID` | Onshape OAuth client id |
| `CLIENT_SECRET` | Onshape OAuth client secret — server-side only, never in the client bundle |
| `CLIENT_URL` | Onshape OAuth token endpoint |
| `APP_NAME` | Display name |
| `ENABLE_LOG` / `LOG_FILENAME` | Optional request logging |

`PORT` is provided by Azure App Service itself; do not set it manually.

## Deploy (zipdeploy)

`pnpm run deploy:server` (`package.json:21`) builds, then runs
`scripts/deployServer.cjs`, which:

1. Requires `AZURE_PUBLISH_USER`, `AZURE_PUBLISH_PASS`, and
   `AZURE_WEBAPP_NAME` (`scripts/deployServer.cjs:21-30`; the legacy
   `AZURE_FUNCTIONAPP_NAME` is still accepted as a fallback name).
2. Runs `npm ci --omit=dev` inside `dist/server/`
   (`scripts/deployServer.cjs:44-51`).
3. Zips `dist/server/` and POSTs it to
   `https://<app>.scm.azurewebsites.net/api/zipdeploy`
   (`scripts/deployServer.cjs:53-57`).
