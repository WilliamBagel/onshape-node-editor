# Style audit — STYLE_GUIDE.md enforcement (issue #33)

Baseline: master `ac186e8`, audited with `scripts/style-check.mjs --report` (comments stripped; tests excluded).

**Before: 110 violations — 71 blocking, 39 in deferred (#9/#26) files. After: 0 blocking, 39 deferred (unchanged, owned by #9/#26).**
No banned-hex, gradient, blur, or literal-hex hits remain outside `src/app/common.css` except the deferred files below and the one documented exception.

## Gate

`pnpm run style-check` (`scripts/style-check.mjs`, Node stdlib only — the repo has no CSS pipeline/stylelint) fails on:

1. banned hex `#1f2937`/`#6b7280`/`#3b82f6` anywhere in `src/` source (incl. `common.css`);
2. `linear-/radial-/conic-gradient()` and SVG `<linearGradient>`/`<radialGradient>`;
3. `backdrop-filter`, `filter: blur(…)`, `backdrop-blur` (JS `.blur()` is not matched);
4. any literal hex outside `src/app/common.css` (the one palette file).
5. (#81) any raw `rgb()/rgba()/hsl()/hsla()` outside `src/app/common.css` (same palette exemption; the guide's max shadow `rgba(0,0,0,.08)` lives there as `--shadow-1` and is consumed via `var()`).

Allowlists: vendored CSS `src/app/onshape/**` + `src/app/OnshapeHTMLCSSReference/**` (Onshape/Bootstrap bundles, never edited); deferred files below (reported, non-blocking); one exception — `src/app/customization/background.css` gradients, which are the canvas grid technique named in the guide, not decorative colour gradients.

## Inventory (before, file:line)

### Deferred (#9/#26) — `src/app/customization/controls/EnumControl.vue` (1)

- [literal-hex] src/app/customization/controls/EnumControl.vue:78 — `--ms-bg: #00000000;`

### Deferred (#9/#26) — `src/app/customization/controls/EnumControl_multiselect-onshape.scss` (38)

- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:32 — `background: var(--ms-bg, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:48 — `background: var(--ms-bg-disabled, #F3F4F6);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:104 — `color: var(--ms-placeholder-color, #9CA3AF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:129 — `background: var(--ms-bg, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:153 — `background: var(--ms-tag-bg, #10B981);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:154 — `color: var(--ms-tag-color, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:169 — `background: var(--ms-tag-bg-disabled, #9CA3AF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:170 — `color: var(--ms-tag-color-disabled, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:194 — `background: #00000010;`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:273 — `background-color: var(--ms-spinner-color, #10B981);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:297 — `background-color: var(--ms-clear-color-hover, #000000);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:310 — `background-color: var(--ms-clear-color, #999999);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:328 — `background-color: var(--ms-caret-color, #999999);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:350 — `border: var(--ms-dropdown-border-width, 1px) solid var(--ms-dropdown-border-color, #D1D5DB);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:352 — `background: var(--ms-dropdown-bg, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:390 — `background: var(--ms-group-label-bg, #E5E7EB);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:391 — `color: var(--ms-group-label-color, #374151);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:406 — `background: var(--ms-group-label-bg-pointed, #D1D5DB);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:407 — `color: var(--ms-group-label-color-pointed, #374151);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:411 — `background: var(--ms-group-label-bg-selected, #059669);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:412 — `color: var(--ms-group-label-color-selected, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:416 — `background: var(--ms-group-label-bg-disabled, #F3F4F6);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:417 — `color: var(--ms-group-label-color-disabled, #D1D5DB);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:422 — `background: var(--ms-group-label-bg-selected-pointed, #0c9e70);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:423 — `color: var(--ms-group-label-color-selected-pointed, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:427 — `background: var(--ms-group-label-bg-selected-disabled, #75cfb1);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:428 — `color: var(--ms-group-label-color-selected-disabled, #D1FAE5);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:450 — `background: var(--ms-option-bg-pointed, #F3F4F6);`
- [banned-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:451 — `color: var(--ms-option-color-pointed, #1F2937);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:455 — `background: var(--ms-option-bg-selected, #10B981);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:456 — `color: var(--ms-option-color-selected, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:460 — `background: var(--ms-option-bg-disabled, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:461 — `color: var(--ms-option-color-disabled, #D1D5DB);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:466 — `background: var(--ms-option-bg-selected-pointed, #26c08e);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:467 — `color: var(--ms-option-color-selected-pointed, #FFFFFF);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:471 — `background: var(--ms-option-bg-selected-disabled, #87dcc0);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:472 — `color: var(--ms-option-color-selected-disabled, #D1FAE5);`
- [literal-hex] src/app/customization/controls/EnumControl_multiselect-onshape.scss:479 — `color: var(--ms-empty-color, #4B5563);`

### Fixed in this change — `src/app/assets/base.css` (7)

- [literal-hex] src/app/assets/base.css:3 — `--vt-c-white: #ffffff;`
- [literal-hex] src/app/assets/base.css:4 — `--vt-c-white-soft: #f8f8f8;`
- [literal-hex] src/app/assets/base.css:5 — `--vt-c-white-mute: #f2f2f2;`
- [literal-hex] src/app/assets/base.css:7 — `--vt-c-black: #181818;`
- [literal-hex] src/app/assets/base.css:8 — `--vt-c-black-soft: #222222;`
- [literal-hex] src/app/assets/base.css:9 — `--vt-c-black-mute: #282828;`
- [literal-hex] src/app/assets/base.css:11 — `--vt-c-indigo: #2c3e50;`

### Fixed in this change — `src/app/assets/main.css` (1)

- [literal-hex] src/app/assets/main.css:14 — `border-color: var(--os-tree-outline, #d7d7d7);`

### Fixed in this change — `src/app/common.css` (3)

- [banned-hex] src/app/common.css:26 — `--text-primary: #1f2937;`
- [banned-hex] src/app/common.css:27 — `--text-secondary: #6b7280;`
- [banned-hex] src/app/common.css:30 — `--accent: #3b82f6;`

### Fixed in this change — `src/app/common/baseapp.ts` (1)

- [literal-hex] src/app/common/baseapp.ts:89 — `border-left-color: #1651b0;border-radius: 50%;height: 10em;`

### Fixed in this change — `src/app/components/BottomBar.vue` (10)

- [literal-hex] src/app/components/BottomBar.vue:69 — `--toolbar-bg: #ffffff;`
- [literal-hex] src/app/components/BottomBar.vue:70 — `--toolbar-border: #e0e0e0;`
- [literal-hex] src/app/components/BottomBar.vue:71 — `--btn-color: #3a3a3a;`
- [literal-hex] src/app/components/BottomBar.vue:72 — `--btn-hover-bg: #ebebeb;`
- [literal-hex] src/app/components/BottomBar.vue:73 — `--btn-active-bg: #d6d6d6;`
- [literal-hex] src/app/components/BottomBar.vue:75 — `--divider-color: #d8d8d8;`
- [literal-hex] src/app/components/BottomBar.vue:110 — `background: #f2f2f2;`
- [literal-hex] src/app/components/BottomBar.vue:111 — `border: 1px solid #e2e2e2;`
- [literal-hex] src/app/components/BottomBar.vue:118 — `background: #4caf6e;`
- [literal-hex] src/app/components/BottomBar.vue:126 — `color: #444;`

### Fixed in this change — `src/app/components/DesignCheckTab.vue` (17)

- [literal-hex] src/app/components/DesignCheckTab.vue:118 — `border: 1px solid #d4d4d4;`
- [literal-hex] src/app/components/DesignCheckTab.vue:120 — `background: #ffffff;`
- [banned-hex] src/app/components/DesignCheckTab.vue:121 — `color: #1f2937;`
- [literal-hex] src/app/components/DesignCheckTab.vue:128 — `border-color: #9ca3af;`
- [banned-hex] src/app/components/DesignCheckTab.vue:138 — `color: #6b7280;`
- [literal-hex] src/app/components/DesignCheckTab.vue:142 — `color: #e06c75;`
- [literal-hex] src/app/components/DesignCheckTab.vue:147 — `color: #b45309;`
- [literal-hex] src/app/components/DesignCheckTab.vue:152 — `color: #15803d;`
- [literal-hex] src/app/components/DesignCheckTab.vue:164 — `border: 1px solid #d4d4d4;`
- [literal-hex] src/app/components/DesignCheckTab.vue:166 — `background: #ffffff;`
- [banned-hex] src/app/components/DesignCheckTab.vue:172 — `color: #6b7280;`
- [literal-hex] src/app/components/DesignCheckTab.vue:187 — `border-bottom: 1px solid #eee;`
- [banned-hex] src/app/components/DesignCheckTab.vue:189 — `color: #1f2937;`
- [literal-hex] src/app/components/DesignCheckTab.vue:202 — `color: #e06c75;`
- [literal-hex] src/app/components/DesignCheckTab.vue:206 — `color: #b45309;`
- [banned-hex] src/app/components/DesignCheckTab.vue:210 — `color: #6b7280;`
- [banned-hex] src/app/components/DesignCheckTab.vue:221 — `color: #3b82f6;`

### Fixed in this change — `src/app/components/tooltip/ToolTip.vue` (6)

- [literal-hex] src/app/components/tooltip/ToolTip.vue:183 — `border-bottom: 6px solid #1a1a1a;`
- [literal-hex] src/app/components/tooltip/ToolTip.vue:194 — `border-top: 6px solid #1a1a1a;`
- [literal-hex] src/app/components/tooltip/ToolTip.vue:200 — `background: #1a1a1a;`
- [literal-hex] src/app/components/tooltip/ToolTip.vue:201 — `color: #f0f0f0;`
- [literal-hex] src/app/components/tooltip/ToolTip.vue:218 — `background: #1a1a1a;`
- [literal-hex] src/app/components/tooltip/ToolTip.vue:219 — `color: #b0b0b0;`

### Fixed in this change — `src/app/customization/OnshapeInputMap.vue` (1)

- [literal-hex] src/app/customization/OnshapeInputMap.vue:141 — `background-color: #0000000F;`

### Fixed in this change — `src/app/customization/OnshapeNode.vue` (4)

- [literal-hex] src/app/customization/OnshapeNode.vue:236 — `--node-ink: #1a1a1a;`
- [literal-hex] src/app/customization/OnshapeNode.vue:237 — `--node-hairline: #d9d9d4;`
- [literal-hex] src/app/customization/OnshapeNode.vue:238 — `--node-hairline-strong: #8c8c86;`
- [literal-hex] src/app/customization/OnshapeNode.vue:239 — `--node-accent: #2f5f8f;`

### Fixed in this change — `src/app/customization/OutlineConnection.vue` (2)

- [gradient] src/app/customization/OutlineConnection.vue:28 — `<linearGradient :id="id" x1="0%" y1="0%" x2="100%" y2="0%" gradientUnits="objectBoundingBox" spreadMethod="reflect">`
- [gradient] src/app/customization/OutlineConnection.vue:33 — `<radialGradient :id="`radial_${id}`" cx="50%" cy="50%" r="50%" fx="0%" fy="50%">`

### Fixed in this change — `src/app/customization/background.css` (6)

- [literal-hex] src/app/customization/background.css:12 — `background-color: #ffffff;`
- [literal-hex] src/app/customization/background.css:14 — `background-image: linear-gradient(#f1f1f1 3.2px, transparent 3.2px),`
- [literal-hex] src/app/customization/background.css:15 — `linear-gradient(90deg, #f1f1f1 3.2px, transparent 3.2px),`
- [literal-hex] src/app/customization/background.css:16 — `linear-gradient(#f1f1f1 1.6px, transparent 1.6px),`
- [literal-hex] src/app/customization/background.css:17 — `linear-gradient(90deg, #f1f1f1 1.6px, #ffffff 1.6px);`
- [literal-hex] src/app/customization/background.css:17 — `linear-gradient(90deg, #f1f1f1 1.6px, #ffffff 1.6px);`

### Fixed in this change — `src/app/rete/stylesettings.ts` (13)

- [literal-hex] src/app/rete/stylesettings.ts:6 — `"Context": "#4EC9B0",`
- [literal-hex] src/app/rete/stylesettings.ts:7 — `"Id": "#266356",`
- [literal-hex] src/app/rete/stylesettings.ts:8 — `"BTParameterSpecQuery-174": "#B2DDF6",`
- [literal-hex] src/app/rete/stylesettings.ts:9 — `"BTParameterSpecEnum-171": "#4FC1FF",`
- [literal-hex] src/app/rete/stylesettings.ts:10 — `"BTParameterSpecQuantity-173": "#B5CEA8",`
- [literal-hex] src/app/rete/stylesettings.ts:11 — `"BTParameterSpecString-170_Concat": "#718368",`
- [literal-hex] src/app/rete/stylesettings.ts:12 — `"BTParameterSpecBoolean-170": "#4e94ce",`
- [literal-hex] src/app/rete/stylesettings.ts:13 — `"BTParameterSpecString-175": "#CE9178",`
- [literal-hex] src/app/rete/stylesettings.ts:14 — `"QueryList": "#B2DDF6",`
- [literal-hex] src/app/rete/stylesettings.ts:15 — `"Enum": "#4FC1FF",`
- [literal-hex] src/app/rete/stylesettings.ts:16 — `"ValueWithUnits": "#B5CEA8",`
- [literal-hex] src/app/rete/stylesettings.ts:17 — `"Boolean": "#4e94ce",`
- [literal-hex] src/app/rete/stylesettings.ts:18 — `"String": "#CE9178"`

## Deferred files (owned by concurrent cards #9/#26 — not edited here)

| File | Owner | Violations found |
|---|---|---|
| `src/app/onshape-utils/featurescripttypes.ts` | #9/#26 | 0 |
| `src/app/onshape-utils/bttypetools.ts` | #9/#26 | 0 |
| `src/app/rete/onshapesockets.ts` | #9/#26 | 0 (socket colours now come from `stylesettings.ts` tokens) |
| `src/app/rete/inputoutput/**` (`onshapeinput.ts`, `onshapefeaturespecinput.ts`, `onshapeoutput.ts`) | #9/#26 | 0 |
| `src/app/customization/controls/**` (`EnumControl.vue`, `EnumControl_multiselect-onshape.scss`, others) | #9/#26 | 39 (listed above) |
| `src/app/customization/OnshapeControl.vue` | #9/#26 | 0 |

## Fixes applied

- `src/app/common.css`: legacy token names (`--text-primary`, `--accent`, `--danger`, …) remapped to the canonical palette (`#1a1a1a`/`#5a5a55`/`#2f5f8f`/`#2a8f82`/`#b4443c`, hairline `#d9d9d4`); type tokens `--font-size-title` 12→14px, `--font-size-field` 11→12px; new socket tokens `--flow-teal-soft`, `--socket-ink`. This also fixes deferred consumers (controls/TopBar/LogPanel) without editing their files.
- `DesignCheckTab.vue`, `BottomBar.vue`, `ToolTip.vue`: literal hex → tokens; secondary grey → ink at 60% opacity; tooltip shadow → `var(--shadow-1)`; BottomBar local `:root` palette removed, pill radius (11px) → `--radius-control`.
- `background.css`: grid/surface hex → `var(--canvas-grid)`/`var(--canvas-warm)`/`var(--surface)` (gradient technique retained, see exception).
- `OnshapeNode.vue`: local hex token definitions → aliases of global tokens (node typography untouched, per #35); `OnshapeInputMap.vue`: 15px label → 12px, `#0000000F` → `var(--hover-tint)`, dead commented hex removed.
- `OutlineConnection.vue`: SVG linear/radial gradient wires removed → solid low-saturation stroke (guide: no gradient wires); default `rgb(79,182,70)` → `var(--flow-teal)`; `Color().lighten()` guarded for token colours.
- `src/app/rete/stylesettings.ts`: socket palette hex → `var(--flow-teal)`/`var(--accent-steel)`/`var(--socket-ink)`/`var(--flow-teal-soft)` (neon `#4FC1FF` etc. removed); `OnshapeSocket.vue` black border → `var(--ink)`.
- `src/app/common/baseapp.ts` spinner `#1651b0` → `var(--accent-steel)`/`var(--hairline)`; `src/app/assets/base.css` scaffold palette → aliases of `common.css` tokens; `main.css` `#d7d7d7`/bright-green `hsla()` links → tokens.

## Notes / out of checker scope

- No `backdrop-filter`/blur/glass hits were found anywhere in `src/` (only JS `.blur()` calls).
- `SnappingSocket.vue` uses `rgba(0,0,0,0)` (fully transparent hit area) — not a colour violation.
- Remaining 11px sizes are meta/keycap only; node typography was not restyled (settled in #35).
- Vendored bundles (`src/app/onshape/onshape-design-tokens.min.css`, `vendor-bundle.css`, `woolsthorpe.css`, `OnshapeHTMLCSSReference/`) still contain blanket hex/gradients by upstream design; they are allowlisted, not edited.

## Update — #81 raw rgb/rgba/hsl gate

`scripts/style-check.mjs` gained rule 5 (`raw-rgb`): `rgb()/rgba()/hsl()/hsla()` outside the palette file `src/app/common.css`. On HEAD `193281b` it found 8 blocking hits, 0 deferred, 0 vendored (vendored `src/app/onshape/**` + `OnshapeHTMLCSSReference/**` still skipped; comment-only and `DhslHb` identifier non-hits confirmed).

- `src/app/assets/base.css` (6): scaffold `--vt-c-divider/text-*` rgba tints moved to `--scaffold-*` tokens in `common.css`, aliased via `var()` — values unchanged.
- `src/app/components/DesignCheckTab.vue` (1): `box-shadow: 0 1px 3px rgba(0,0,0,0.08)` (guide's max shadow) → `var(--shadow-1)`, no exception needed.
- `src/app/rete/connection-snapping/SnappingSocket.vue` (1): `rgba(0,0,0,0)` transparent hit area → `transparent` keyword (semantically identical, no exception).
- No new per-file exceptions; `common.css` remains the sole palette exemption. Negative probe: temp file with `color: rgba(0,0,0,.5)` failed the gate, then removed.
- Gate after: 0 violations, 0 blocking.
