# UI audit harness

`scripts/ui-audit.mjs` is the headless audit for the user-visible defects
reported against the editor. It extends the raw-CDP approach of
`scripts/ui-verify.mjs` (headless Chrome, no Playwright/Puppeteer) and
checks each defect against **measured** rendered values — computed styles,
bounding rects, DOM counts, connection-path coordinates — with every CSS
selector guarded by `el.matches(sel)` before its computed style is
trusted. A check that cannot be made reliable headlessly is reported
`SKIPPED` with the reason, never a false `PASS`.

## Run it

The dev server must already be running:

```sh
pnpm run dev            # terminal 1
node scripts/ui-audit.mjs --url http://localhost:5173/onshape-node-editor/ --out tmp/ui-audit
# defaults: --url http://localhost:5173/onshape-node-editor/ --out tmp/ui-audit
# Chrome: google-chrome-stable/chromium on PATH, or --chrome / CHROME_BIN
```

Output: one `PASS`/`FAIL`/`SKIP` line per check with the measured values,
PNG screenshots (`01-editor.png`, `02-map-header.png`, …) and `report.json`
in the output directory. **Exit code is non-zero if any check fails**, so it
can gate a build.

## What it proves

| # | Check | Passes when |
|---|-------|-------------|
| 1 | `map-header-left-aligned` | The Definition/map header title starts near the header's left edge and its centre is far from the header centre (not centered). |
| 2 | `empty-definition-label` | An emptied Definition (emptied via the editor model, then restored) renders an explicit empty-state label instead of a blank area. |
| 3 | `collapse-keeps-sockets` | Collapsing a node keeps its input/output sockets in the DOM *and* visible (+ non-zero size), counted before and after. |
| 4 | `context-menu-click-open` | Hovering a context-menu category does not open its submenu; clicking opens it and the child list is visible (scrollability measured and reported). |
| 5 | `palette-search-features` | F3 (fallback Shift+A) palette search for `chamfer` returns a Chamfer result, and a second feature query returns other Onshape features. |
| 6 | `frame-encloses-selection` | Ctrl+G on the selection produces a frame whose measured rect encloses the selected node bounds with ≥ 8px padding, including an expanded Definition. |
| 7 | `frame-below-connection` | `elementFromPoint` along an existing connection never returns the frame (frame background does not paint over the wire). |
| 8 | `socket-anchor-points` | On a fresh boot, before any node moves, the open connection's path start/end matches the clicked socket's centre (≤ 3px) for click-from-output and click-from-input. |
| 9 | `title-edit-outline` | The focused title editor's outline is not saturated blue (HSL saturation ≤ 0.65; the guide's steel-blue accent `#2f5f8f` sits at ~0.51). |

Notes: socket anchors (8) run first, straight after boot — earlier canvas
interactions can shift the area and confound the measurement. The
context-menu check (4) may insert a node when hovering shifts items under
the cursor; the harness reloads a clean graph afterwards if the node count
changed. The title-edit check (9) opens the editor via the pencil button's
own click handler as a fallback, because CDP coordinate clicks do not land
on that small button headlessly (probed) — the detail records `openedVia`.

## Adding a check

Add a `pass/fail/skip(id, detail)` block after navigating or interacting,
screenshot with `cdp.shot(name)`, and record the measured values in the
detail. Prefer computed values over source-token reads, and guard every
selector with `matches()` — the context-menu bug class this harness exists
for was a selector matching nothing while the stylesheet looked correct.
