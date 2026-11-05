# UI explorer core — implementation notes

Implements `docs/ui-explorer.md` (contract) in `scripts/ui-explorer.mjs`.
Dev-only harness; no app source under `src/app` is touched.

## Usage

```sh
node scripts/ui-explorer.mjs --url http://localhost:5173/onshape-node-editor/ \
  --out tmp/ui-explorer-core-smoke --max-actions 35
node scripts/ui-explorer.mjs --out tmp/ui-explorer-core-full --max-actions 80
```

Flags: `--url`, `--out`, `--task`, `--max-actions` (default 80), `--headed`,
`--chrome` / `CHROME_BIN`, `--timeout`, `--keep-open`. Chrome auto-detected at
`/usr/bin/google-chrome-stable`. Exit 1 on critical/high issues or task failure,
0 otherwise, 2 on harness crash (still writes a minimal `report.json`).

Optional modules are loaded dynamically and never crash the run when absent:
`scripts/ui-explorer/tasks.mjs` (named tasks; absent → exploration only with a
warning; task result `skipped`) and `scripts/ui-report.mjs` /
`scripts/annotate-ui-shots.py` (dashboard/annotated output; absent → warning,
`report.json` only, `annotated: null` on issues).

## Tours (all ten contract areas)

Baseline → toolbar (Upload/New/Save/Open skipped with reasons; file chooser
cancelled via `page.on('filechooser')`) → settings (open/toggle-preference-and-
restore/close, modal-only dialog-close check) → F3 + Shift+A palettes (4
searches each, category clicks) → canvas context menu (empty-canvas points,
click-to-open categories, leaf search) → per-node Definition expand/collapse,
collapse-keeps-sockets, title edit+cancel, parameter controls → socket
connections (candidate-pair search; a completed wire must survive a neutral
click, since the pending wire also counts as a `[data-testid=connection]`)
→ frame/group/Tab → keyboard (F3, Shift+A, Ctrl+G, Ctrl+Shift+G, Tab, Escape)
→ deterministic generic click sweep (sorted by label+index, unsafe labels
skipped, `--max-actions` cap). Graph-mutating actions reload before the next
independent action.

## Detectors (measured, not inferred)

Obscured controls (`elementFromPoint`, skipping intentional menu/dialog
overlays), text clipping (Range glyph rects vs element box — `scrollWidth`
alone over-counts padding and produced false positives on fitted socket
labels), off-viewport, missing accessible name, contrast < 4.5:1 vs nearest
opaque ancestor, tiny targets (<16px, toolbar icon buttons with tooltips
exempt), broken SVG `<use>`/zero-width images, console errors + failed
requests with URLs, stuck modal dialogs (only `[aria-modal=true]` counts —
node headers also carry `role=dialog`). Dedupe key is
`(category, area, title, selector|label)`; per-category cap 20.

## Verification (this worktree)

- `node --check scripts/ui-explorer.mjs` — passes.
- Smoke: `--max-actions 35` → 35 actions (31 passed, 4 skipped), 16 issues
  (15 medium, 1 low), exit 0; every issue/action screenshot verified present
  (`tmp/verify-report.mjs`, 0 bad).
- Full: `--max-actions 80` → 80 actions (72 passed, 8 skipped, 0 failed),
  all 7 areas covered, exit 0.
- No `--task` run: `scripts/ui-explorer/tasks.mjs` does not exist in this
  worktree (owned by another worker); task status is `skipped`, exit still 0.

## Known findings (from the smoke run)

- Parameter inputs (`.os-param-text/.os-param-number`) and the `?` help links
  have no accessible name (medium, accessibility).
- One failed resource request (low, console) — see `report.json` for the URL.
