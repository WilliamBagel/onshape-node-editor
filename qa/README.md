# QA product

Permanent exploratory UI QA: harness + real dashboard app + visual-review packet.
`src/app` UI is untouched (another card owns node chrome); this folder is integration glue only.

## Layout

```
qa/
  harness/    explorer.mjs · tasks.mjs · tasks.smoke.mjs · annotate-ui-shots.py
              ui-verify.mjs · report.mjs (markdown only) · sample-report.json
              default-graph-check.mjs
  dashboard/  Vite app: index.html · vite.config.ts · src/main.ts · src/styles.css
              dashboard.smoke.mjs (Playwright http smoke)
  review/     review-packet.mjs · visual-review-prompt.md
  runs/       review packets (gitignored except .gitkeep)
  README.md   this file
```

`scripts/ui-explorer.mjs`, `scripts/ui-report.mjs`, `scripts/ui-report.smoke.mjs`,
`scripts/annotate-ui-shots.py` remain as thin compat wrappers.

## Run

```sh
pnpm run dev   # app dev server
pnpm run explore:ui -- --url http://localhost:5173/onshape-node-editor/ --out tmp/qa-runs/<id> --task make-filleted-cylinder
pnpm run build:qa-dashboard          # -> dist/qa-dashboard
pnpm run smoke:qa-dashboard          # http + Playwright, sample report
pnpm run qa:node-chrome              # node chrome regression check (needs a dev server; QA_URL optional)
pnpm run qa:defects -- --url http://127.0.0.1:5173/onshape-node-editor/   # group-wire + palette defect checks (exits 1 on defects; --advisory to stay green)
pnpm run qa:default-graph                     # default debug graph must open clean (exits 1 on invalid/orphaned nodes or console errors)
pnpm run qa:build-validation                  # Build on the unwired default graph must fail, never log "Built FeatureScript" (boots vite on 5221; QA_URL skips the boot)
QA_URL=http://127.0.0.1:5214/onshape-node-editor/ pnpm run qa:feature-panel   # feature/group toolbar + type-picker + live-I/O regression check (see below)
pnpm run qa:report -- --report tmp/qa-runs/<id>/report.json --out qa/runs/<id>   # report.md (includes the Activity timeline)
pnpm run qa:review -- --report tmp/qa-runs/<id>/report.json   # -> qa/runs/<id>/review-packet.md
```

Explorer output (`tmp/qa-runs/<id>/`): **only** `report.json`, `screenshots/`,
`annotated/` (storage). No HTML is ever written to `tmp/`.

## Dashboard

A real Vite app, not a generated file. It loads a report from, in order:
`?report=<url>` / `?data=<url>`, `data/report.json`, `/onshape-node-editor/qa/data/report.json`,
`report.json`; screenshot paths in the report resolve relative to the report URL.
Palette per STYLE_GUIDE.md: `#f7f7f5/#1a1a1a/#2f5f8f/#b4443c`, hairline borders,
radius <= 6px, no CDN. Port colours (`#d6e2ef/#e6f0f7/#ffd60a/#b8860b/#2a8f82`)
are documented data-encoding CSS variables in `src/styles.css`.

Controls (unchanged): explicit All chips, toggle active chip off, live search over
title/description/area/category/expected/actual/suggestion/console, `×`/Escape
clear, `Showing N of M`, Clear all / Clear filters, images (broken -> placeholder).

Serve locally: `pnpm exec vite preview --config qa/dashboard/vite.config.ts` or any
static server over `dist/qa-dashboard` plus a `data/` folder.

## Watching the agent run

- **Live console:** `explorer.mjs` and `defect-checks.mjs` print one line per
  action as it happens, e.g.
  `[QA 012/80] act-012 Group: wire, create group, Tab in/out … [group] failed 412ms changed=true shot=screenshots/actions/012-….png`.
  That is the whole tour in order — if a step fails, the line says why; the
  `PASS` / `FAIL` / `ISSUE` lines underneath give the human-readable detail.
- **Afterwards:** open the dashboard (`dist/qa-dashboard` + `data/report.json`
  as below). Below the issue cards, the **Activity timeline** lists every
  action in order: action id, human label, area, status, duration, changed,
  and the action screenshot thumbnail. `qa:report` (`report.md`) carries the
  same timeline as a markdown table.
- **Where files live:** `tmp/qa-runs/<id>/report.json` + `screenshots/actions/…`
  + `screenshots/issues/…` (only `report.json` + PNGs — never HTML). The
  dashboard is the Vite app; `qa/runs/<id>/review-packet.md` is the optional
  vision-review packet. In CI the same layout is copied to `dist/app/qa/` and
  the run dir is uploaded as an artifact. Live site:
  `https://williambagel.github.io/onshape-node-editor/qa/`.

## Defect checks (`qa:defects`, also inside `explore:ui`)

Three user-reported defects, each filed as an issue with screenshots — never
skipped, and exits 1 when found (pass `--advisory` to report without failing):

1. **Group restored wires:** with real wires around the two Chamfer nodes, TopBar
   *Create group from selection*,
   `Tab` in / out, then every restored `path.path` endpoint (`getScreenCTM`) is
   measured against its live socket centre. Offset > 5px (master probe saw
   ~47–48px down on external wires) files *Restored wires offset after
   exiting node group*, with before/inside/after screenshots.
2. **Palette descriptors:** search `chamfer` / `fillet` (Shift+A and F3).
   Each `.palette-item-meta` / `.actions-item-desc` must have computed
   contrast ≥ 4.5:1, gap ≤ 24px from the name (not far-right), and be
   readable. Failures file *Palette descriptors faint/far from names*.
3. **Standard Library case:** the same lowercase searches must return the
   match while its displayed name is capitalized (`Chamfer`, not `chamfer`).
   Violations join the palette issue above.

## Default graph check (`qa:default-graph`)

Opens the debug/default editor (dev server, `developerMode`) and asserts
against the live graph (`window.editor` + rendered DOM): no transient
`group-input`/`group-output` boundary nodes outside group editing, no
duplicate node ids, no node with a missing feature spec, every node produces
a FeatureScript line and passes graph validation, and no console/page
errors. Exits 1 on any failure. The sample is sanitized on open
(`sanitizeGraph` in `src/app/rete/graph-sanitize.ts`, also run by
`loadGraph`); genuinely invalid/orphaned nodes are pruned and logged through
the build log, validator failures are kept and reported, never swallowed.

## Build validation check (`qa:build-validation`)

`qa/harness/build-validation-check.mjs` — permanent regression check for the
malformed-build defect. The default graph (two Chamfers, Define Feature, End
Feature, no connections) flattens to the End Feature alone; the generator used
to return a header plus one orphan `});` (181 bytes) and Build logged
`Built FeatureScript (181 bytes)`. The check boots the app on port 5221 (or
uses `QA_URL`), clicks Build on that unwired graph, and fails unless the Build
entry is an **error** naming the missing Define Feature / End Feature chain,
no `Built FeatureScript` entry appears, no malformed source is attached to the
log, and `studioEvents.build()` itself rejects with that actionable message
instead of resolving to source.

## Feature panel check (`qa:feature-panel`)

`qa/harness/feature-panel-check.mjs` — permanent regression check for the
feature-toolbar / type-picker / group-live-I/O user complaints. Driven with
real mouse/keyboard (Playwright) on the dev server (`developerMode` sample:
two Chamfers, Define Feature, End Feature); editor state is asserted through
`window.controls` (the same controls the UI calls, exposed in `App.vue` for
this purpose), node state through the rendered `.node` DOM. Covers:

1. **Feature toolbar discoverability** — clicking the Define Feature node
   auto-opens `FeatureConfigPanel` ("Feature parameters", feature name, rows);
   closing leaves the `feature-panel-open-rail` and the TopBar
   "Feature parameters" control, both of which reopen it.
2. **Feature parameter editing** — add `qaProbe` (row + `definition.qaProbe`
   in `controls.getDefineFeatureState()` + node-DOM output label), serialize
   round-trip, rename, retype to `numberValueWithUnits`, remove; asserts no
   dangling wire after removal.
3. **Type picker width/contrast** (both `FeatureConfigPanel` and
   `GroupConfigPanel`) — selected label and `numberValueWithUnits` option are
   not clipped (`scrollWidth <= clientWidth`), option shows the full label,
   option text is dark ink `rgb(26, 26, 26)` on white (contrast 17.4:1,
   >= 4.5:1 required), socket colour only on the swatch dot
   (`rgb(229, 169, 61)` for the default add-row type).
4. **Group toolbar + live I/O** — group the two Chamfers (defect-checks
   element-handle selection recipe), enter with Tab,
   `group-panel-open-rail` while the panel is closed, clicking
   "Start Feature" opens the panel, add `qaGroupIn`, exit with Tab and
   immediately see `qaGroupIn` on the Group 1 instance DOM and in its editor
   `inputs` (`group-1.input.qaGroupIn`) without clicking/dragging; re-enter,
   remove, exit, assert it is gone with no dangling connection.
5. **No member-socket dropdown** — no `.candidate-select`, no `<select>`
   inside either panel, no "Select a member socket" text, no browser
   dialogs, no console errors. (Pre-existing `<select>` in SettingsDialog
   and LogPanel are unrelated and out of scope.)

Report: `tmp/qa-runs/feature-panel/report.json` (JSON only, never HTML) +
one screenshot. Exits 1 on any failure. Needs a dev server;
`QA_URL` defaults to `http://127.0.0.1:5214/onshape-node-editor/`.

## Review packet (free subagents)

`qa/review/review-packet.mjs` writes `qa/runs/<id>/review-packet.md` with issue
list, absolute screenshot paths, and per-issue questions on alignment, clipping,
typography, socket/collapse geometry, z-order and palette. Hand the packet + PNGs
to a free local subagent:

```
model: stealth/crouton-alpha, high effort
prompt: qa/review/visual-review-prompt.md
```

It returns confirmed / not-reproduced / unclear per issue with pixel evidence.

## CI/CD

- `ci.yml` check job: builds the dashboard and runs `dashboard.smoke.mjs`.
- `ci.yml` ui-qa job (advisory, retained): explorer -> `tmp/qa-runs/<run_id>`,
  builds dashboard, copies build + `data/report.json` + screenshots/annotated into
  `dist/app/qa/`, uploads `dist/app/qa` + run dir as artifact.
- `deploy-production.yml`: same into `dist/app/qa/`, so
  `https://williambagel.github.io/onshape-node-editor/qa/` serves the app loading
  `/qa/data/report.json`. Advisory semantics retained: findings don't block deploy,
  harness crashes still fail.

## Migration caveats

- Old paths (`scripts/ui-explorer.mjs` etc.) are wrappers; update scripts to `qa/`.
- `ui-report.mjs` no longer writes `dashboard.html`/`report.md` into the run dir;
  use `qa:report` for markdown and the Vite app for visuals.
- Dashboard needs http (fetch); it does not work from `file://` without a server.
- `qa/runs/` packets may reference absolute screenshot paths; keep the run dir.
