# UI explorer dashboard & annotator

Two standalone tools that consume the explorer's `report.json` (schema
version 1; see `docs/ui-explorer.md`):

## Dashboard / Markdown report

```sh
node scripts/ui-report.mjs --report <out>/report.json --out <out>
```

Writes `<out>/dashboard.html` (single self-contained static file: inline
CSS/JS, no CDN/fonts, works from `file://`, responsive to ~1000px,
print-readable) and `<out>/report.md`.

The dashboard shows a header (URL / generated-at / duration), summary
cards (total issues, critical/high/medium/low, actions, task status —
totals, not filtered counts), severity + category filter chips
(including an explicit `All` chip per group; clicking the active chip
again clears that group back to `All`; `aria-pressed` + keyboard focus
ring), a live text search (filters title, description, area, category,
expected, actual, suggestion and console text; `×` clears, Escape
clears, and a live `Showing N of M issues` count is shown), and a
`Clear all` button which clears severity/category/search in place
(without reloading). The no-match empty state offers `Clear filters`
rather than a dead end. Issue cards are sorted
critical → low then area/title with the annotated screenshot when that
file exists (otherwise the raw screenshot, otherwise a quiet
"Screenshot not available" placeholder), expected/actual, numbered
reproduction steps, collapsible console output, and a prominent
user-level "Suggested fix". A "How to read this" legend, an empty state
for zero issues, and a task section (per-step pass/fail/skip + error)
are included. All report strings are HTML-escaped (no template library).
Missing optional fields render as placeholders; an unknown
`schemaVersion` warns but renders best-effort.

## Screenshot annotator

```sh
python3 scripts/annotate-ui-shots.py --report <out>/report.json --out <out>/annotated [--no-badge] [--thickness N]
```

For each issue with a `bbox` and an existing `screenshot`, draws a 3px
(default) red `#b4443c` rectangle plus a numbered badge (`001`, `002`, … —
the 1-based issue index) at the box's top-left, saving to
`annotated/<same basename>` and updating `issue.annotated` in
`report.json` to the path relative to the report file, then writing
`report.json` back. Re-running is idempotent (always redraws from the
original). Multiple issues on one screenshot share one output image with
all boxes. If an issue has a `viewport` and the image size differs from
it, the bbox is scaled by `image/viewport` per axis (retina handling);
without a viewport, CSS pixels are used directly. Boxes are clamped to
the image. Missing images / bad bboxes / missing Pillow warn to stderr
and never fail the run (exit 0); only an unreadable `report.json` exits
non-zero.

## Sample fixture

`scripts/ui-report.sample.json` is a realistic 4-issue report (high
console error, high task failure, medium visual, low accessibility)
matching the schema. Verify with:

```sh
node --check scripts/ui-report.mjs
node --check scripts/ui-report.smoke.mjs
python3 -m py_compile scripts/annotate-ui-shots.py
node scripts/ui-report.mjs --report tmp/ui-report-sample/report.json --out tmp/ui-report-sample
python3 scripts/annotate-ui-shots.py --report tmp/ui-report-sample/report.json --out tmp/ui-report-sample/annotated
node scripts/ui-report.smoke.mjs
```

`scripts/ui-report.smoke.mjs` opens `tmp/dashboard-fix/dashboard.html`
from `file://` with system Chrome (playwright-core), exercises every
control with real clicks/typing (High → All, Accessibility, search,
no-match, `×`/Escape, `Clear all`), asserts `Showing N of M` counts and
≥24px controls, writes `tmp/dashboard-fix/smoke.png`, and exits
non-zero on failure.
