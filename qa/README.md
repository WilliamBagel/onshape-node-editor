# QA product

Permanent exploratory UI QA: harness + real dashboard app + visual-review packet.
`src/app` UI is untouched (another card owns node chrome); this folder is integration glue only.

## Layout

```
qa/
  harness/    explorer.mjs · tasks.mjs · tasks.smoke.mjs · annotate-ui-shots.py
              ui-verify.mjs · report.mjs (markdown only) · sample-report.json
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
pnpm run qa:report -- --report tmp/qa-runs/<id>/report.json --out qa/runs/<id>   # report.md
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
