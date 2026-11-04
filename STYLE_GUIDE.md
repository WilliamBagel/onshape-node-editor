# Node Editor Style Guide

Source: Screenshot_20261103_210411.png (Onshape-style feature graph). Keep UI quiet; the graph is the hero.

## Palette (light)
- Canvas: white/near-white `#fafafa` with a very faint dot or line grid (`#eee`, barely visible).
- Node cards: white `#ffffff`, 1px hairline border `#d4d4d4`; border sharpens to `#9ca3af` (or 1px blue) on selection/hover. Flat — no or minimal shadow (max `0 1px 3px rgba(0,0,0,.08)`).
- Panels/toolbar: white or `#f5f5f5`, hairline-separated from canvas. No dark chrome anywhere.
- Text: dark grey `#1f2937` primary, `#6b7280` secondary; hierarchy via opacity, not hue.
- Accents (light, desaturated): selection/focus blue `#3b82f6` (sparingly — border, checkbox); ports/wires carry a teal/green `#14b8a6` for flow/data; error `#e06c75`. Greyscale carries ~95% of the UI.

## Shape & spacing
- Node cards: 4–6px radius. Header strip slightly differentiated: white with a heavier bottom hairline.
- Ports: small rects (~8px) hugging the node edge, teal when connected, hollow when not; wires 1–2px gentle bezier, grey or low-sat port color.
- Rows inside nodes: label left, value right-aligned, tight 4px-scale spacing (4/8/12).

## Typography
- System sans (Inter/system-ui): 12px node titles (600 weight), 11px fields/values. No all-caps tracking.
- Monospace 11px for literal values (`0.005 m`, `46 deg`).
- Text hierarchy from opacity (100/60/40%), not color changes.

## Icons & controls
- Every button carries a monochrome stroke icon (16px, one set, e.g. Lucide); top toolbar is icon-first. Ghost/flat by default; filled only for the single primary action (e.g. Run/Build).

## Shortcuts & commands
- Menus and any search/command palette show keybindings as right-aligned keycap chips: monospace 10px, 1px border `#d4d4d4`, e.g. `Ctrl K`. Register every command in the palette; ones without shortcuts still appear with hint text.

## Warnings & status
- Canvas stays clean: no floating warnings, tooltips, or labels over the graph.
- All warnings/errors/info live in a fixed top or bottom status bar: icon + one line, accent-coded, dismissible. Per-node problems show as a small corner badge; details open in the status bar.

## Do / Don't
- Do: white cards on faint-grid canvas, hairline borders, opacity-based text hierarchy, keycaps on commands, icon buttons.
- Don't: gradients, dark chrome, heavy shadows, saturated fills, text labels on the canvas.
