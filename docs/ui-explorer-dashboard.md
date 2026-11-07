# UI explorer dashboard (moved to qa/dashboard)

Canonical docs: `qa/README.md` § Dashboard. The dashboard is a real Vite app (`qa/dashboard/`, `pnpm run build:qa-dashboard` -> `dist/qa-dashboard`) that fetches `data/report.json` (or `?report=<url>`); it is not a generated standalone HTML. Filters/search behaviour is unchanged (All chips, toggle-off, live search, x/Escape, Showing N of M, Clear all/Clear filters, images). Smoke: `pnpm run smoke:qa-dashboard`.
