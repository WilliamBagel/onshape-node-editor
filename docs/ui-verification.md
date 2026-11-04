# UI verification with screenshots

`scripts/ui-verify.mjs` drives the real editor in headless Chrome over the
DevTools Protocol, asserts rendered layout/style values, and writes PNGs plus
`report.json`. Use it before calling a UI change done — unit tests cannot see
collapsed heights, computed contrast, or the context menu's actual width.

## Run it

The dev server must already be running:

```sh
pnpm run dev            # terminal 1
pnpm run verify:ui      # terminal 2
# or pick an output directory / URL
node scripts/ui-verify.mjs --url http://localhost:5173/onshape-node-editor/ --out tmp/ui-check
```

It exits non-zero if a check fails and prints `SHOT <path>` for every capture.
Chrome is found at `google-chrome-stable`/`chromium`; override with
`--chrome` or `CHROME_BIN`.

## What it proves

- the feature's `Definition` map starts expanded, collapses on a real click,
  shrinks the node, and re-opens on the next click;
- the canvas context menu is the themed 260px surface (not the preset's 120px
  box), has wrapping for long option names, and no `►` bracket glyph;
- F3 opens the action palette and a query returns an insertable **node** row,
  not only commands;
- the rendered keycap foreground/background contrast is at least 4.5:1;
- the node-header collapse control is a 12px stroked chevron.

## Reviewing the pictures

The script cannot judge "looks good". Open the PNGs in the output directory
(`01-editor.png`, `02-map-collapsed.png`, `04-context-menu.png`,
`05-action-search.png`) and check for clipped labels, misaligned chevrons, or
stray glyphs. Subagents should attach the PNGs to their report or inspect them
with vision; treating script PASS alone as visual approval is not enough.

## Adding a check

Add a `check(name, condition, detail)` block after navigating or interacting.
Prefer computed values (`getComputedStyle`, `getBoundingClientRect`) over
source-token reads: the context-menu bug was a selector that matched nothing,
so the stylesheet looked correct while the rendered menu did not.

The dev app mounts through `App.initDev()`. Two startup races used to leave
headless/Cold-cache runs blank: a `load` handler attached after the event had
already fired, and stylesheet `onload` handlers attached after a cached CSS
response had loaded. Both are guarded now; keep those guards if you refactor
`main.ts`/`baseapp.ts`.
