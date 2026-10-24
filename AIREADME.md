# AIREADME

Written by AI agents, for AI agents. Human-facing setup docs are in
`docs/extension-setup.md` (issue #19); this file is the working map. It describes the repo at commit
`6e018aa`, and any claim here that contradicts the code should be treated as
stale — re-verify before acting.

## What this project is

An Onshape app extension (runs in an iframe inside Onshape) for editing a node
graph and compiling it to FeatureScript. Long-term shape: build graph -> write
FeatureScript into a Feature Studio -> insert the resulting custom feature into
a Part Studio -> inspect values while authoring.

Client: Vue 3 + Rete v2 (TypeScript, Vite). Server: Azure Functions shim that
does OAuth token exchange/refresh, a file fetcher, and a wildcard proxy to the
Onshape REST API (`src/server/`).

## State of truth

- `docs/design-rules.md` — conventions that are not optional (read DR-001
  before touching anything selection-related).
- GitHub issues — the backlog. `priority/p0` are the only ones that matter
  until the first end-to-end loop exists. `gh issue list --label priority/p0`.
- `tmp/HANDOFF.md` — the operational handoff for whoever picks this up next,
  including the local cleanup work that is deliberately NOT filed as issues.
- `tmp/ROADMAP.md` — phase ordering and dependency notes.
- `tmp/AGENT-TASKS.md` — per-issue completion criteria, verification ladder and
  final pre-close checklist. Use it to decide whether an issue is actually done.
- `tmp/HANDOFF-ORCHESTRATOR.md` — kanban orchestration plan: pre-work, wave-1
  cards with per-card model pins, and the verification protocol.
- `tmp/` is intentionally untracked scratch. Do not commit it.

## Local pre-work (done in the working tree, before the issue backlog)

Recorded 2026-10-23, at `6e018aa` + the pre-work commits below.

- **Toolchain.** `pnpm install` needs `CI=true` (or
  `confirmModulesPurge=false`): `node_modules/` existed as 34 mostly-empty
  directories and pnpm refuses to purge a modules dir without a TTY
  (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). After that: 16,641 files,
  `pnpm run build:app` and `pnpm run build:server` both exit 0.
- **Line endings.** HEAD already stored every text file as LF; the "118 modified
  files" were *worktree* CRLF vs *index* LF, which is why
  `git diff --ignore-cr-at-eol` was empty for all of them and why the
  normalization commit contains only `.gitattributes`. The working tree was then
  re-materialized from the index; there are 0 CRLF files among tracked paths.
- **Lockfiles.** The stray root `package-lock.json` is deleted (DR-004).
  `scripts/server-lock/package-lock.json` is **not** stray:
  `scripts/copyServerAssets.cjs` copies it into the Functions dist so consumers
  can `npm ci` deterministically. Do not delete it.
- **Library data.** `scripts/std-library-scrapper/` and the two
  `featurescript-library*.json` files were recovered from `stash@{0}` by path
  (never `git stash apply`). Decision: `featurescript-library-organized.json`
  (1189 entries) is **committed** as runtime data; the raw
  `featurescript-library.json` (1400 entries) and the scraper's `library.html`
  input are **gitignored** and regenerated with `pnpm run scrape:all` — so
  `pnpm run organize:docs` cannot run from a clean checkout without a network
  scrape first.
- **Deploy trigger.** `deploy-production.yml` watched `main`; the default branch
  is `master`.

## Commands

pnpm is canonical (CI pins pnpm 11.5.2 and `pnpm-lock.yaml` exists). The stray
`package-lock.json` is leftover and should be deleted, not used.

```
CI=true pnpm install          # required: node_modules may exist as empty dirs,
                              # and pnpm refuses to purge them without a TTY
pnpm test                     # vitest run: 11 files / 89 tests
pnpm run type-check           # vue-tsc --build over all three projects: 0 errors
pnpm run type-check:gate      # same run, parsed into counts; fails on any error
pnpm run build:app            # vite build -> dist/app
pnpm run build:server         # tsc -p tsconfig.server.json + asset copy
pnpm run dev                  # vite dev server
```

`.github/workflows/ci.yml` runs install (`--frozen-lockfile`), `pnpm run
type-check`, `pnpm test` and both builds on every pull request against `master`,
and carries no exemptions — the compiler is clean repo-wide since #24 patched the
one dependency that used to report errors. Its GitHub-side run is unverified until
a branch is pushed.

`src/server/**` needs `@types/node-fetch` (devDependency) to type-check and
build; the runtime `node-fetch` itself comes from `scripts/server-lock`
via the copied lockfile, not from the root install.

## Type checking and the gate

`tsconfig.json` is a solution file: `"files": []` plus references to
`tsconfig.app.json`, `tsconfig.node.json` and `tsconfig.server.json`. It must
stay that way — before this was fixed, the root file was a stray standalone
config that shadowed all three, so the app was never checked under its own
settings, and `pnpm run type-check` emitted `.js` files into `src/`, which broke
`pnpm run build:app`.

`tsconfig.app.json` inherits `@vue/tsconfig/tsconfig.dom.json` with two
deliberate relaxations, `"strict": false` and `"verbatimModuleSyntax": false`:

- The app source has never been type-checked under this project's config and
  reports 212 errors under the preset (122 type-only imports, 44 uninitialized
  properties, ~46 strict-null/index). Tracked as issue **#25**. Do not turn
  strictness on without paying it down.
- `verbatimModuleSyntax: true` also breaks `vite build`: rollup cannot resolve
  deep type imports such as `rete-vue-plugin/_types/presets/classic/types`, and
  only import elision was hiding it.

**The gate is `pnpm run type-check:gate`** (`scripts/typecheck-gate.mjs`): it runs
the same build with `--force` and parses the diagnostics into counts, so CI can
fail on a number instead of a human reading a log. **Every error counts now,
wherever it lives** — the node_modules counter is still printed, but it no longer
buys an exemption. That is possible because issue **#24** removed the 25 errors
that used to live inside `onshape-typescript-fetch` (a source-only git tarball,
`main: "index.ts"`, no `.d.ts`, so `skipLibCheck` could not cover its generated
`.ts` models) with a `pnpm patch` recorded in `patches/` and wired through
`patchedDependencies` in `pnpm-workspace.yaml`. Removing that entry brings all 25
back and makes the gate print `GATE FAILED`, so the patch is load-bearing, not a
filter. A non-zero compiler exit with nothing parseable is itself a failure.

**Tests.** `pnpm test` is vitest (`vitest.config.ts`, node environment) and
covers the graph -> FeatureScript pipeline: the generator's indent/dedupe/header,
the node processor's main-path selection and leaf pruning, the linked-node walk
ordering, the DR-001 warning gate and the load-time selection guard, a
byte-identical graph serialize/deserialize round trip, and the Feature Studio
upload flow (payload byte-exactness, the read/diff/confirm/write ordering, the
error text surfaced verbatim). Run one file with `pnpm test <path>` (or
`npx vitest run <path>`).

Scraper scripts (see below): `pnpm run scrape:docs`, `pnpm run organize:docs`,
`pnpm run scrape:all`.

## File map

```
src/app/app.ts                     App entry: wires OnshapeAPI, UserInfo, Vue root
src/app/common/onshapeapi.ts       All Onshape API clients (onshape-typescript-fetch)
src/app/common/baseapp.ts          Extension bootstrap, OAuth, CSS injection
src/app/rete/editorbase.ts         Editor construction + buildStudio() codegen driver
src/app/rete/editor.ts             Demo entry: hardcoded chamfer nodes + 1k-line spec
src/app/rete/devEditor.ts          Demo entry with a full Loft spec (larger harness)
src/app/rete/rete-onshape-nodeprocessor.ts   Graph -> ordered node list (main path, pruning)
src/app/rete/nodes/                OnshapeNode base, DefineFeatureNode, CustomFeatureNode,
                                   OutputFeatureNode
src/app/rete/inputoutput/          Inputs/outputs, feature-spec-driven parameter inputs
src/app/rete/controls/             Control model bridging specs to Vue components
src/app/customization/             Node/socket/connection/control Vue components
src/app/onshape-utils/             AppStorage, NodeStore, UserInfo, FeatureStudioGenerator,
                                   btType<->FeatureScript helpers, client messaging
src/app/onshape/                   Onshape CSS/icons + featurescript-library*.json (scraped)
src/server/                        Azure Functions: oauth, refresh, getfile, api proxy
scripts/std-library-scrapper/      FsDoc scraper + organizer (see "Data sources")
```

## What is live, dead, or absent

Live: extension bootstrap and OAuth, Rete canvas, node/connection rendering,
feature-spec-driven parameter controls, build pipeline producing FeatureScript
text, and the Feature Studio upload (#1: `onshape-utils/featurestudioupload.ts`
— read, line diff, confirm, `updateFeatureStudioContents`, or
`createFeatureStudio` when the element is missing; the toolbar Upload /
Upload Target buttons drive it). The upload target is persisted in browser
storage (`onshape-utils/featurestudiotarget.ts`) because `UserInfo.init()` only
resolves inside an embedded session; `UserSettings.featureStudioTarget` carries
the same type for #6.

Partly dead: `UserInfo` and `NodeStore` in `src/app/onshape-utils/` — the
app-element persistence path. `UserInfo` **is** constructed in `App.start()`
(`src/app/app.ts`) and `processUserInfo()` calls `init()`/`getUserSettings()`,
but its settings are only read at startup and nothing writes them; `NodeStore`
is never touched, the toolbar Save/Open handlers are empty, and `init()` only
resolves inside an embedded Onshape session. (An earlier version of this file
said "never instantiated" — that was wrong.) `rete-scopes-plugin` is installed
but only used by the standalone demo `src/app/rete/scopes.ts`.

Absent: any call into a Part Studio (add feature / eval FeatureScript), node
creation from a catalog, graph serialization through the toolbar (the schema
exists — `src/app/rete/serialization/`, issue #5 — but nothing calls it), typed
value sockets, expression-based codegen, grouping in the real editor, a log panel
for messages (#4), and a real settings/diff dialog (the upload uses `prompt` /
`confirm`).

## Data sources

1. Live feature specs: `FeatureStudioApi.getFeatureStudioSpecs` — typed
   `BTFeatureSpec` with UI parameters. Currently called once with hardcoded ids
   and discarded (`src/app/app.ts`).
2. Scraped FsDoc library: `featurescript-library.json` (1400 entries) and
   `featurescript-library-organized.json` (1189 deduplicated: 693 functions,
   112 predicates, 87 types, 122 consts, 175 enums). Generated by
   `scripts/std-library-scrapper/`. Nothing in `src/` reads these yet.
   Scraped parameter types are often `value`/`array`/`map`, so typed ports need
   a curated map — do not assume the scrape is type-safe.

## Traps

- `node_modules/` can look installed while every package directory is empty.
  Check `find node_modules -type f | wc -l` before blaming the code. `pnpm
  install` needs `CI=true` if the modules dir already exists as empty dirs.
- `pnpm run type-check` is clean repo-wide (0 errors) since #24 patched the
  vendored client, and the gate counts *every* error now. If 25 errors about
  `onshape-typescript-fetch` models ever come back, the `patchedDependencies`
  entry in `pnpm-workspace.yaml` is missing or the lockfile no longer matches it
  — pnpm will refuse a frozen install in that state.
- `src/app/**` currently type-checks with `strict` and `verbatimModuleSyntax`
  off; turning either on reports ~212 errors (see "Type checking and the gate").
- `src/app/rete/editor.ts` and `devEditor.ts` are demo harnesses with inline
  spec literals; do not treat their hardcoded nodes as the product path.
- `git status` is noisy from CRLF/LF churn. Use
  `git diff --ignore-cr-at-eol` to see real edits. `.gitattributes` is now
  present, so this should be historical.
- A months-old stash (`stash@{0}`, 2026-06-08) contains the scraper and library
  JSON, but its application-code half predates later commits. Recover paths
  selectively, never `git stash apply`.
- The `/api` proxy returns upstream error bodies as plain text and sets
  `Proxy-Url`; error handling must read text, not assume JSON.
- `ClientMessaging.requestSelection` (interactive selection in the Onshape
  viewport) is a debug affordance only — see DR-001.
- Onshape API method names differ from what intuition suggests; verify against
  the upstream generated client (`onshape-typescript-fetch`), not memory.
- **The token refresh path is broken as wired** (issue #22): both client paths
  send `GET /refresh?code=…` (`src/app/common/oauth.ts:66-74`,
  `src/app/common/onshapeapi.ts:216-219`, `:232-237`) while the function is
  registered `POST`-only (`src/server/index.ts:26-30`) and reads
  `refresh_token` (`src/server/refresh.ts:37-40`). Do not build on it; it fails
  when the access token expires.
- **`src/server/.env` is copied into the deployment package** (issue #23):
  `scripts/copyServerAssets.cjs:38-41` puts it in `dist/server/`, and
  `scripts/deployServer.cjs:40` zips everything under that directory — so
  `CLIENT_SECRET` ships in the zip. It is gitignored, but it is not private.

## Change protocol

1. Read `docs/design-rules.md`; if a change violates one, change the rule first.
2. Keep the gate green: `pnpm run type-check:gate`, plus `pnpm run build:app` and
   `pnpm run build:server`. Keep `pnpm test` green and add a failing test before
   fixing a defect.
3. Do not hand-edit generated FeatureScript in a Feature Studio; the generator
   owns that file (its header says so).
4. Keep line endings LF. Do not reintroduce CRLF files.
5. Update this file when you change architecture, commands, or the
   live/dead/absent picture above.
