# UI explorer (moved to qa/)

Canonical docs now live in `qa/README.md`. This file is kept as a pointer.

- Harness: `qa/harness/explorer.mjs` (was `scripts/ui-explorer.mjs`)
- Tasks: `qa/harness/tasks.mjs`
- Dashboard app: `qa/dashboard/` (Vite, built to `dist/qa-dashboard`)
- Markdown report: `qa/harness/report.mjs` (no HTML generation)
- Annotator: `qa/harness/annotate-ui-shots.py`
- Visual review: `qa/review/` (`pnpm run qa:review`)

Old `scripts/ui-*.mjs` paths remain as compat wrappers. tmp/ holds only `report.json`, screenshots, annotated PNGs and storage under `tmp/qa-runs/<id>/` — no HTML.
