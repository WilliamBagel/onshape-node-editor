/**
 * Icon + shortcut-chip metadata for the canvas context menu.
 *
 * Icons come from the shipped Onshape sprite (`src/app/onshape/icons.svg`);
 * no emoji, no second icon set (STYLE_GUIDE.md "Icons & controls").
 */
import type { OnshapeSvgIcon } from "../components/SvgIcon.vue";
import type { CatalogEntry } from "../onshape/catalog/types";

const CATEGORY_ICONS: Record<string, OnshapeSvgIcon> = {
    Modeling: "#svg-icon-extrude-button",
    Math: "#svg-icon-math-snippet-button",
    Utilities: "#svg-icon-feature-snippet-button",
    Utility: "#svg-icon-feature-snippet-button",
    "Onshape features": "#svg-icon-feature-snippet-button",
    enums: "#svg-icon-list-view",
    live: "#svg-icon-feature-snippet-button",
};

const ENTRY_ICONS: Record<string, OnshapeSvgIcon> = {
    chamfer: "#svg-icon-chamfer-button",
    fillet: "#svg-icon-fillet-button",
    extrude: "#svg-icon-extrude-button",
    revolve: "#svg-icon-revolve-button",
    loft: "#svg-icon-loft-button",
    sketch: "#svg-icon-sketch-snippet-button",
};

export const ACTION_ICONS = {
    copy: "#svg-icon-copy-button",
    paste: "#svg-icon-paste-command",
    delete: "#svg-icon-trash",
} as const satisfies Record<string, OnshapeSvgIcon>;

export function iconForCategory(category: string): OnshapeSvgIcon {
    return CATEGORY_ICONS[category] ?? "#svg-icon-folder";
}

export function iconForCatalogEntry(entry: Pick<CatalogEntry, "name" | "category">): OnshapeSvgIcon {
    return ENTRY_ICONS[entry.name.toLowerCase()] ?? iconForCategory(entry.category);
}

/**
 * Display form of a binding for a keycap chip. The value itself always comes
 * from `editorSettings`, never a hardcoded label; only long key names are
 * shortened so the chip stays narrow (`Delete` -> `Del`).
 */
export function shortcutChipLabel(combo: string): string {
    if (combo === "Delete") return "Del";
    if (combo === "Escape") return "Esc";
    return combo;
}
