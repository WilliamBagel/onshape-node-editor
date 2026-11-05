# Node Editor Style Guide

Source: Screenshot_20261103_210411.png (Onshape-style feature graph). Keep UI quiet; the graph is the hero.

## Palette (light)
Choose the palette deliberately; do not inherit a framework default. The stock "generated UI" palette — slate/grey text `#1f2937`/`#6b7280` with blue-500 `#3b82f6` accents — is banned (see *Not default-AI* below).
- Canvas: warm off-white `#f7f7f5` with a very faint dot or line grid (`#e6e6e3`, barely visible).
- Node cards: white `#ffffff`, 1px hairline border `#d9d9d4`; border sharpens to `#8c8c86` (or the accent) on selection/hover. Flat — no or minimal shadow (max `0 1px 3px rgba(0,0,0,.08)`).
- Panels/toolbar: `#fbfbf9` or white, hairline-separated from canvas. No dark chrome anywhere.
- Text: warm ink `#1a1a1a` primary. Hierarchy comes from opacity (100/60/40%), not from swapping in a second grey hue; if a solid secondary is unavoidable use `#5a5a55`.
- Accents (desaturated, chosen): selection/focus steel blue `#2f5f8f` (sparingly — border, checkbox); ports/wires carry a muted teal `#2a8f82` for flow/data; error `#b4443c`. Greyscale carries ~95% of the UI. No purple/indigo, no neon cyan.

## Port colours: data-encoding exception
Port fills are **data encoding, not chrome**: each value type must be tellable apart at 100% zoom, so ports may be brighter and more saturated than the page palette. The muted tokens collapse easily-confused types into near-identical colours (regression #33), so the socket style table in `src/app/rete/stylesettings.ts` maps each family to one bright `--socket-*` token defined in `src/app/common.css` (the one palette file; hues informed by the pre-#33 values `#4EC9B0`, `#B2DDF6`, `#4FC1FF`, `#B5CEA8`, `#4e94ce`, `#CE9178`, tuned to read on the white node surface). The chrome bans above (muted greys, no saturated fills) do **not** apply to these data encodings. Chosen hues (one per family):
| Value family | Fill (token) | Hue family |
|---|---|---|
| Query (`Query`, `QueryList`) | `#4ec9b0` (`--socket-query`) | teal-green |
| Id | `#4e94ce` (`--socket-id`) | steel blue |
| ValueWithUnits (`BTParameterSpecQuantity-*`) | `#e5a93d` (`--socket-quantity`) | amber |
| Enum | `#ce9178` (`--socket-enum`) | salmon orange |
| Boolean | `#7fb069` (`--socket-boolean`) | clear green |
| String | `#e8799b` (`--socket-string`) | pink |
| Vector | `#4fc1ff` (`--socket-vector`) | cyan |
| Matrix | `#8e7cc3` (`--socket-matrix`) | light violet |
| Transform | `#d95763` (`--socket-transform`) | rose-red |
| CoordSystem | `#a3d977` (`--socket-coordsystem`) | lime |
| number | `#f2d06b` (`--socket-number`) | warm yellow |
| map | `#6fa8dc` (`--socket-map`) | sky blue |
| Context | `#26a69a` (`--socket-context`) | deep teal |
Selection of a node is a ring **behind** the ports (outer `box-shadow` on `.ns-dialog-frame`, #37): ports paint above the outline at every edge. Intra-node z-index is scoped by `isolation: isolate` on `.feature-dialog-main`; node paint order stays owned by `NodeOrderKeeper` (DR-007) — never add a per-node z-index.

## Shape & spacing
- Node cards: 4–6px radius. Header strip slightly differentiated: white with a heavier bottom hairline.
- Ports: small rects (~8px) hugging the node edge, teal when connected, hollow when not; wires 1–2px gentle bezier, grey or low-sat port color.
- Rows inside nodes: label left, value right-aligned, tight 4px-scale spacing (4/8/12).

## Typography
- System sans (Inter/system-ui), but use a scale with real contrast — not one size for everything:
  - 14px / 700 node titles and panel headings (true bold — a real Inter Bold face, never synthesized).
  - 12px / 600 section labels.
  - 12px / 400 field labels.
  - 13px / 400 values (13px, not 11–12px, so numeric values stay legible at 100% zoom). Quantity inputs are values: 13px sans, never monospace/Courier.
  - 11px / 400 meta and keycaps only.
- Line-height 1.35 for body, 1.2 for titles. No all-caps tracking.
- Monospace 12px for literal values (`0.005 m`, `46 deg`). Quantity *inputs* are not literals — they are value controls and stay 13px sans.
- Text hierarchy from opacity (100/60/40%), not color changes.
- Do not flatten the UI into 12px titles + 11px everything: that uniform tiny scale is the default-AI look and is rejected.

## Not default-AI
The UI must not look like an unmodified model-generated dashboard. Concretely:
- **No stock palette:** slate `#1f2937` / grey `#6b7280` / blue-500 `#3b82f6` is the tell. Use the chosen warm-ink + steel-blue palette above.
- **No uniform type:** every element at 12/11px with 500 weight reads as generated. Use the 14/13/12/11 scale with 600 only on titles.
- **No framework defaults:** no Tailwind/`ui-*` colour names leaking into components, no default `rounded-lg`, no `shadow-md`, no `bg-white/80` glass.
- **No decorative effects:** gradients, blur/glassmorphism, glow rings, purple-to-blue gradients, emoji as icons, oversized radii (>8px), fully saturated primary fills.
- **Colour is chosen, not inherited:** if a value comes from a vendor stylesheet or a framework default, it still needs a deliberate decision recorded next to it.
- When in doubt, remove colour and decoration rather than adding it; the graph is the hero.

## Icons & controls
- Every button carries a monochrome stroke icon (16px, one set, e.g. Lucide); top toolbar is icon-first. Ghost/flat by default; filled only for the single primary action (e.g. Run/Build).

## Shortcuts & commands
- Menus and any search/command palette show keybindings as right-aligned keycap chips: monospace 10px, 1px border `#d4d4d4`, e.g. `Ctrl K`. Register every command in the palette; ones without shortcuts still appear with hint text.

## Warnings & status
- Canvas stays clean: no floating warnings, tooltips, or labels over the graph.
- All warnings/errors/info live in a fixed top or bottom status bar: icon + one line, accent-coded, dismissible. Per-node problems show as a small corner badge; details open in the status bar.

## Do / Don't
- Do: warm off-white canvas, white cards, hairline borders, a real type scale (14/13/12/11), opacity-based hierarchy, keycaps on commands, icon buttons, one chosen accent.
- Don't: gradients, dark chrome, heavy shadows, saturated fills, text labels on the canvas, stock slate+blue palettes, uniform 12/11px type, glass/blur, purple or neon accents.
