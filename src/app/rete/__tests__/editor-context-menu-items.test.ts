/**
 * Context-menu rows: what a canvas right-click offers vs. what a node
 * right-click offers, and that every row carries an icon (STYLE_GUIDE
 * "Icons & controls") with live shortcut chips on the clipboard actions.
 */
import { describe, expect, it, vi } from "vitest";

import { buildEditorContextMenuList } from "../editor-context-menu-items";
import { CustomFeatureNode } from "../nodes/customfeaturenode";
import type { CatalogEntry } from "../../onshape/catalog/types";
import type { CategoryGroup } from "../catalog-node-factory";
import { DEFAULT_BINDINGS, type ShortcutBindings } from "../../ui/editorSettings";
import { setUpBoxFeatureSpec } from "../../test-utils/fixtures";

const BINDINGS: ShortcutBindings = { ...DEFAULT_BINDINGS };

function entry(name: string, category: string): CatalogEntry {
    return { key: `${category}:${name}`, name, category, description: "", kind: "statement", nodeable: true } as CatalogEntry;
}

const GROUPS: CategoryGroup[] = [
    { category: "Modeling", entries: [entry("Chamfer", "Modeling"), entry("Fillet", "Modeling")] },
    { category: "Math", entries: [entry("cross", "Math")] },
];

function actions() {
    return {
        copy: vi.fn(),
        paste: vi.fn(),
        remove: vi.fn(),
        createNode: vi.fn(() => () => undefined),
    };
}

describe("buildEditorContextMenuList", () => {
    it("a canvas right-click keeps the search bar and catalog categories", () => {
        const { searchBar, list } = buildEditorContextMenuList("root", GROUPS, actions(), BINDINGS);

        expect(searchBar).toBe(true);
        expect(list.map((item) => item.key)).toEqual([
            "copy",
            "paste",
            "delete",
            "category:Modeling",
            "category:Math",
        ]);
        const categories = list.slice(3);
        expect(categories[0].sectionStart).toBe(true);
        expect(categories[1].sectionStart).toBe(false);
        expect(categories[0].subitems?.map((item) => item.label)).toEqual(["Chamfer", "Fillet"]);
        expect(categories[1].subitems).toHaveLength(1);
    });

    it("a node right-click is actions only — no search bar, no catalog", () => {
        const node = new CustomFeatureNode(setUpBoxFeatureSpec());
        const { searchBar, list } = buildEditorContextMenuList(node, GROUPS, actions(), BINDINGS);

        expect(searchBar).toBe(false);
        expect(list.map((item) => item.key)).toEqual(["copy", "paste", "delete"]);
        expect(list.every((item) => item.subitems == null)).toBe(true);
        expect(list.some((item) => item.key.startsWith("category:"))).toBe(false);
    });

    it("targets the right-clicked node when the action runs", async () => {
        const node = new CustomFeatureNode(setUpBoxFeatureSpec());
        const spies = actions();
        const { list } = buildEditorContextMenuList(node, GROUPS, spies, BINDINGS);

        await list[0].handler();
        await list[1].handler();
        await list[2].handler();

        expect(spies.copy).toHaveBeenCalledWith(node);
        expect(spies.paste).toHaveBeenCalledTimes(1);
        expect(spies.remove).toHaveBeenCalledWith(node);
    });

    it("canvas actions carry no node argument", async () => {
        const spies = actions();
        const { list } = buildEditorContextMenuList("root", GROUPS, spies, BINDINGS);

        await list[0].handler();
        await list[2].handler();

        expect(spies.copy).toHaveBeenCalledWith(undefined);
        expect(spies.remove).toHaveBeenCalledWith(undefined);
    });

    it("gives every action row an icon and a live shortcut chip", () => {
        const { list } = buildEditorContextMenuList("root", GROUPS, actions(), BINDINGS);
        const [copy, paste, remove] = list;

        expect(copy.icon).toBe("#svg-icon-copy-button");
        expect(paste.icon).toBe("#svg-icon-paste-command");
        expect(remove.icon).toBe("#svg-icon-trash");
        expect(copy.shortcut).toBe("Ctrl+C");
        expect(paste.shortcut).toBe("Ctrl+V");
        expect(remove.shortcut).toBe("Del");
        // Chips come from the registry, not a hardcoded label: rebind and re-read.
        const rebound = buildEditorContextMenuList(
            "root",
            [],
            actions(),
            { ...BINDINGS, copy: "Alt+C" },
        );
        expect(rebound.list[0].shortcut).toBe("Alt+C");
    });

    it("catalog leaf handler runs the create action itself", () => {
        const inner = vi.fn();
        const spies = { ...actions(), createNode: vi.fn(() => inner) };
        const { list } = buildEditorContextMenuList("root", GROUPS, spies, BINDINGS);
        const leaf = list.find((item) => item.key === "category:Modeling")?.subitems?.[0];

        expect(leaf).toBeDefined();
        leaf?.handler();

        expect(spies.createNode).toHaveBeenCalledWith(GROUPS[0].entries[0]);
        expect(inner).toHaveBeenCalledOnce();
    });

    it("gives every category and catalog leaf an icon", () => {
        const { list } = buildEditorContextMenuList("root", GROUPS, actions(), BINDINGS);
        const categories = list.filter((item) => item.subitems != null);
        expect(categories).toHaveLength(2);
        for (const category of categories) {
            expect(category.icon).toMatch(/^#svg-icon-/);
            for (const leaf of category.subitems ?? []) {
                expect(leaf.icon, leaf.label).toMatch(/^#svg-icon-/);
            }
        }
        expect(list[3].subitems?.[0].icon).toBe("#svg-icon-chamfer-button");
    });
});
