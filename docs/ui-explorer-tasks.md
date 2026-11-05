# UI explorer tasks (moved to qa/harness)

Canonical task docs: `qa/README.md`. Tasks live in `qa/harness/tasks.mjs`; smoke driver `qa/harness/tasks.smoke.mjs`.
# UI explorer tasks

`scripts/ui-explorer/tasks.mjs` exports `tasks` (array) and the individual
task objects. Each task is `{ id, name, description, async run(ctx) }`.
All interactions are visible-UI only (keyboard/mouse/palette/toolbar);
nothing uses `page.evaluate` to mutate the graph model. Read-only DOM
inspection (`textContent`, `data-testid`, input values) is used solely to
decide the next click and to record what a user sees.

## Context contract (`run(ctx)`)

| Field | Required? | Shape | Notes |
|---|---|---|---|
| `ctx.page` | yes | Playwright `Page` | Every action targets this page. Tasks call `page.setDefaultTimeout(8000)`. |
| `ctx.log` | no | `(message) => void` | Falls back to `console.log`. |
| `ctx.shot` | no | `(name) => path` | Screenshot by name (no extension); harness owns the directory. Fallback: `./tmp/ui-task-smoke/<name>.png` via `page.screenshot`. |
| `ctx.record` | no | `(label, status, detail) => void` | Called once per step; `status` is `'pass' \| 'fail' \| 'skip'`. |
| `ctx.assert` | no | `(condition, message) => void` | **Not relied on** for step gating — kept for harness compatibility. |
| `ctx.issue` | no | `(...args) => void` | Called on each failed step if present. |
| `ctx.reload` | no | `() => Promise<void>` | Reset to a clean graph. Fallback: `page.reload({waitUntil:'networkidle'})` + wait. |

**Verdict = throw.** Steps are collected (not aborted on first failure)
so a single run surfaces every blocker; after the last step, `run`
throws an `Error` listing failed steps if any required step failed.
A task that returns normally passed. The harness should catch the throw
and mark the task failed; `record`/`issue` calls made before it are the
per-step evidence.

## Tasks

### `smoke` — fast UI sanity (expected: PASS)

Boot (≥4 sample nodes) → F3 action palette open/close → Shift+A node
palette open/close → Settings via toolbar open/Cancel → Definition
`aria-expanded` flip on `.map-input-header` → node collapse strip
appear/re-expand → node count still ≥4 and Build logs
"Built FeatureScript".

Verified 2026-11-04 against `http://localhost:5173/onshape-node-editor/`
with `node scripts/ui-explorer/tasks.smoke.mjs`: **PASS, 7/7 steps**.
Screenshots: `tmp/ui-task-smoke/smoke-*.png`.

### `make-filleted-cylinder` — real user scenario (expected: FAIL, app blocker)

Insert `fCylinder` via Shift+A → inspect sockets from the DOM → set its
radius → insert `opFillet` via Shift+A (exact) → probe closest `fillet`
→ connect body → entities → Build must emit `fCylinder`+fillet code.

**Observed (same run): FAIL with 6 evidenced blockers, 3 passing steps.**

Passing:
- `fCylinder` IS insertable (exact palette match). Outputs
  `[output-context]`, inputs `[input-context, input-id, input-radius]`.
  Its radius text input is editable — filling `1 inch` sticks.
- Reload/reset and Build button themselves work.

Blockers (each screenshot in `tmp/ui-task-smoke/fillet-*.png`):
1. **No body output on `fCylinder`** — only `output-context` (label
   "Context"). There is no body socket to drag from.
   (`fillet-fcylinder-inserted.png`)
2. **`fCylinder` Definition is generic and geometry-less** — warning
   "Generic definition — definition map schema not known; generated code
   uses an empty map." Definition exposes only `radius`;
   `topCenter`/`bottomCenter` (Vector) are absent, so no cylinder
   geometry can be specified through the UI.
3. **`opFillet` is not insertable at all** — Shift+A search `opFillet`
   returns exactly `[opFullRoundFillet, opModifyFillet, fillet]`, no
   `opFillet` item. (`fillet-opfillet-search.png`)
4. **Closest `fillet` has an empty generic Definition** — warning as
   above, map shows "Definition (empty) — No parameters", inputs only
   `[input-context, input-id]`. No `entities`/`radius` input exists to
   connect to or set. (`fillet-fillet-inserted.png`)
5. **Connection endpoints do not exist** — the required
   body-output → fillet-input wire cannot be started because neither
   endpoint is in the DOM (Context→Context wiring is possible after
   dragging nodes apart, but is not body→entities and is not counted).
6. **Build output ignores disconnected nodes** — log says "Built
   FeatureScript (181 bytes)" but the generated script is the empty
   feature (`FeatureScript 2960; import(...); });`) with no
   `fCylinder`/fillet statements. Build success therefore does **not**
   prove the scenario worked. (`fillet-build.png`)

The task deliberately throws rather than passing on the basis of (6).

## Throwaway driver (test-only)

`scripts/ui-explorer/tasks.smoke.mjs` — launches Chromium via
`playwright-core`, runs every task with a minimal ctx, writes
`tmp/ui-task-smoke/report.json`. Not imported by the explorer harness.
Requires `playwright-core` (package.json devDependency; a worktree
without its own `node_modules` falls back to a scratch install — see
the header comment) and Chrome at `/usr/bin/google-chrome-stable`
(override `CHROME_BIN`). Dev server must be running; do not kill it.

```sh
node scripts/ui-explorer/tasks.smoke.mjs [--url ...] [--out tmp/ui-task-smoke]
# exit 1 if any task throws (make-filleted-cylinder always does, per above)
```

## Gotchas for the core harness worker

- **Focus trap:** after editing a node input (e.g. radius), keystrokes go
  to the input and the app ignores shortcuts — Shift+A/F3 will not open
  until focus leaves the field. `openNodePalette` clicks empty canvas
  (640, 820) first; replicate this in new tasks.
- **Insert position:** palette inserts land at viewport centre and stack
  on top of each other. Drag nodes apart (`dragNode`) before screenshotting
  or socket-hunting.
- **Palette left open:** a failed exact match leaves the palette open;
  the next `openNodePalette` click on empty canvas hits the backdrop and
  closes it before reopening.
- **Build ≠ correctness:** loose nodes don't affect the generated
  script. Always assert on the generated FeatureScript text, not the
  "Built" log line.
- **Config mismatch note:** `playwright-core@1.64.1` is declared in
  `package.json` but is NOT present in this worktree's (or the main
  checkout's above-worktree) `node_modules` — the driver fell back to a
  standalone install at `~/.hermes/cache/scratch/pw`. The core worker's
  harness environment should ensure `pnpm install` has actually run in
  the worktree before importing the driver; `tasks.mjs` itself imports
  nothing and has no such dependency.
