# UI explorer and review dashboard

`scripts/ui-explorer.mjs` is an exploratory QA agent for the Onshape node
editor. It boots a real Chrome through `playwright-core` (system
`google-chrome-stable`; no browser download), walks the editor's surfaces,
clicks controls in a clean state, records console/runtime errors, measures
rendered UI defects, and writes a report plus a static dashboard.

Unlike `scripts/ui-audit.mjs` (nine fixed assertions), the explorer is
breadth-first: it opens menus/palettes/dialogs, expands and collapses nodes and
Definition maps, tries keyboard shortcuts, creates frames/groups, and (optionally)
performs a realistic task such as building a filleted cylinder. It is meant to
find problems you did not think to assert, not to replace the unit/UI suites.

## CLI

```sh
# dev server must already be running
pnpm run explore:ui -- \
  --url http://localhost:5173/onshape-node-editor/ \
  --out tmp/ui-explorer \
  --task make-filleted-cylinder \
  --max-actions 80

# no task: pure exploration
pnpm run explore:ui -- --out tmp/ui-explorer
```

Flags:

| Flag | Default | Meaning |
|---|---|---|
| `--url` | `http://localhost:5173/onshape-node-editor/` | App URL |
| `--out` | `tmp/ui-explorer-<timestamp>` | Output directory (recreated) |
| `--task` | none | Named task from `scripts/ui-explorer/tasks.mjs` |
| `--max-actions` | `80` | Hard cap on interactions (timeout guard) |
| `--headed` | off | Show Chrome |
| `--chrome` | auto / `CHROME_BIN` | Chrome executable |
| `--timeout` | `30000` | Per-action timeout in ms |
| `--keep-open` | off | Do not close Chrome on exit (debug) |

Exit code is non-zero when any **critical** or **high** issue is found, or when
the requested task fails. Medium/low findings still exit 0 (so the tool can run
in a scheduled smoke job without blocking on polish).

## Output

```
<out>/
  dashboard.html          ← open in a browser; filter/sort issues, see screenshots
  report.md               ← plain-text handoff for humans and agents
  report.json             ← machine-readable source of truth
  screenshots/
    00-baseline.png
    actions/<nnn>-<slug>.png
    issues/<nnn>-<slug>.png
  annotated/
    <nnn>-<slug>.png      ← issue screenshot with a red box + numbered badge
```

`dashboard.html` is fully static (no server, no CDN). It must render correctly
when opened via `file://`: summary cards, severity/category filters, one row per
issue with a thumbnail, annotated screenshot, expected/actual, reproduction
steps, console output, and a **user-level suggested fix** in plain language.
Relative paths only.

## Report schema (source of truth)

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-04T00:00:00.000Z",
  "url": "http://localhost:5173/onshape-node-editor/",
  "durationMs": 12345,
  "task": {
    "id": "make-filleted-cylinder",
    "name": "Make a filleted cylinder",
    "status": "passed|failed|skipped",
    "steps": [{"label": "...", "status": "passed|failed|skipped", "detail": "..."}],
    "error": null
  },
  "summary": {
    "actions": 42,
    "issues": 3,
    "critical": 0,
    "high": 1,
    "medium": 1,
    "low": 1
  },
  "actions": [
    {
      "id": "act-001",
      "name": "Open Settings",
      "area": "toolbar",
      "status": "passed|failed|skipped",
      "durationMs": 120,
      "changed": true,
      "error": null,
      "consoleErrors": [],
      "screenshot": "screenshots/actions/001-open-settings.png"
    }
  ],
  "issues": [
    {
      "id": "ui-001",
      "title": "Short, concrete problem statement",
      "severity": "critical|high|medium|low",
      "category": "functional|visual|accessibility|console|ux|content",
      "area": "toolbar|palette|context-menu|node|canvas|settings|group|task",
      "description": "What is wrong and why it matters.",
      "expected": "What a user should see/happen.",
      "actual": "What actually happened.",
      "steps": ["Open ...", "Click ..."],
      "suggestion": "User-level fix in plain language; no internal API names.",
      "screenshot": "screenshots/issues/001-short-slug.png",
      "annotated": "annotated/001-short-slug.png",
      "bbox": {"x": 10, "y": 20, "width": 120, "height": 32},
      "viewport": {"width": 1440, "height": 900},
      "actionId": "act-001",
      "console": []
    }
  ]
}
```

Coordinates in `bbox` are CSS pixels relative to the viewport/screenshot. The
annotator may clamp boxes to the image and must never fail the run if Pillow is
missing: it should emit a warning and skip `annotated` files.

## Modules and ownership

| Path | Responsibility |
|---|---|
| `scripts/ui-explorer.mjs` | CLI, Playwright boot, tours/discovery, detectors, orchestration |
| `scripts/ui-explorer/tasks.mjs` | Named realistic tasks (`make-filleted-cylinder`, smoke task) |
| `scripts/ui-report.mjs` | Reads `report.json`, writes `dashboard.html` and `report.md` |
| `scripts/annotate-ui-shots.py` | Reads `report.json`, draws boxes/badges into `annotated/` |
| `docs/ui-explorer.md` | This contract |

The explorer must degrade gracefully if the report/annotate modules are absent
(for example during a core-only checkout): write `report.json`, print a warning,
and continue. The reporter must be runnable standalone:
`node scripts/ui-report.mjs --report <out>/report.json --out <out>`.

## Exploration requirements

At minimum the explorer must exercise these areas and record an action row for
each attempt:

1. **Boot/baseline** — no console errors, toolbar, canvas and node count.
2. **Toolbar** — every button that is safe to invoke: Run, Build, Upload, Graph
   target, New graph, Create group, Run target, Save, Open, Settings. File
   chooser and external-Onshape actions may be `skipped` with a reason; never
   hang on a native picker. Use `page.on('filechooser')` to dismiss.
3. **Settings dialog** — open, visit every tab/section, toggle a preference and
   restore it, close; verify no modal/backdrop remains.
4. **Action palette (F3) and Add-node palette (Shift+A)** — open both; search
   for nodes in categories (e.g. `chamfer`, `fillet`, `cylinder`, `math`); open
   every category; verify results appear inside categories; close.
5. **Canvas context menu** — right-click; open every top-level category by
   click (not hover); search for a leaf in a subcategory; close.
6. **Nodes** — for each node type present: expand/collapse Definition, collapse
   the node and verify sockets remain visible, edit title and cancel, open each
   parameter control type present (map/array/query/quantity), close.
7. **Sockets/connections** — click output then input; verify a connection path
   exists; undo/reload.
8. **Frames/groups** — select nodes, frame them, select and group them, Tab into
   and out of the group, verify the outer graph is restored.
9. **Keyboard** — F3, Shift+A, Ctrl+G, Ctrl+Shift+G, Tab, Escape; record which
   shortcuts do something and which do nothing.
10. **Generic click sweep** — enumerate visible `button`, `[role=button]`,
    `[role=menuitem]`, `summary`, `input[type=checkbox]`, `.palette-item`,
    `.menu .block` not already covered; click each in a fresh reload when safe;
    stop at `--max-actions`. Record skipped elements and reasons.

Actions that mutate the graph should be followed by a reload before the next
independent action, so findings are reproducible and one failure does not poison
the tour. Dialog/menu actions should close with Escape and verify closure.

## Detector requirements

Record an issue only when the condition is measured, not inferred:

- Uncaught page exceptions and `console.error` during an action (category
  `console`).
- Visible interactive controls whose centre is covered by another element
  (`elementFromPoint` not the control or a descendant) — visual/functional.
- Text clipped by its own box (`scrollWidth > clientWidth + 2` with hidden/
  ellipsis overflow) or controls partly outside the viewport.
- Controls with no accessible name (no text, `aria-label`, `title`, or labelled
  child) — accessibility.
- Text contrast below 4.5:1 for normal text, computed against the nearest
  non-transparent ancestor background; skip deliberately disabled items.
- Clickable targets smaller than 16×16 CSS px that are not icon-only toolbar
  buttons with a tooltip.
- Visible `[role=dialog]` or modal backdrop still present after a close action.
- Buttons/menu items that produce no DOM/visual change when a change is
  expected (disclosure, tab, menu command); do not flag commands whose job is
  external (Run/Upload/Save).
- Broken SVG `<use href="#...">` references and zero-natural-width images.
- Task-specific assertions (below).

Deduplicate by `(category, area, normalized title, selector)`. Cap each category
at a reasonable number (e.g. 20) so a systemic defect does not drown the report.

## Task contract

`scripts/ui-explorer/tasks.mjs` exports:

```js
export const tasks = {
  'make-filleted-cylinder': {
    id: 'make-filleted-cylinder',
    name: 'Make a filleted cylinder',
    description: 'Create a cylinder with fCylinder, add opFillet, connect them, and build.',
    async run(ctx) { /* ctx: page, shot, record, assert, issue, reload, log */ }
  }
};
```

`run` must use only the visible UI (palette/keyboard/mouse), not page JS that
mutates the graph model. It should leave the graph in a state the explorer can
screenshot and report. A failed task is an issue with area `task` and a clear
step-level error; it is not a harness crash. The task must be robust to the
catalog's generic/empty Definition maps: if a node cannot be fully parameterized
from the UI, record the exact blocker instead of silently passing.

## Style and safety

- No new UI that is shipped to users; this is a dev tool. The dashboard is a
  static report, not app chrome.
- Never type credentials, tokens, or real Onshape data. Use the dev sample graph.
- Never click destructive graph actions (delete all, overwrite file, upload to a
  real Feature Studio) without a clear confirmation flag; mark them skipped.
- Keep dependencies to `playwright-core` plus existing packages; annotation uses
  Python Pillow if available.
- All paths in the report are relative to the output directory.
