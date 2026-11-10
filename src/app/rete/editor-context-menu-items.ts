/**
 * Builds the canvas/node context-menu list. Kept out of `editorbase.ts` so the
 * row shape (icons, shortcut chips, section breaks) is unit-testable without a
 * live rete editor.
 */
import type { OnshapeNode } from "./nodes/onshapenode";
import type { CatalogEntry } from "../onshape/catalog/types";
import type { CategoryGroup } from "./catalog-node-factory";
import type { ShortcutBindings } from "../ui/editorSettings";
import {
    ACTION_ICONS,
    iconForCatalogEntry,
    iconForCategory,
    shortcutChipLabel,
} from "../customization/menu-icons";
import type { EditorContextMenuItem } from "../customization/context-menu-types";

export interface EditorContextMenuActions {
    /** Copy the current selection, or `node` when it is not part of it. */
    copy: (node?: OnshapeNode) => void | Promise<void>;
    paste: () => void | Promise<void>;
    /** Delete the current selection, or `node` when it is not part of it. */
    remove: (node?: OnshapeNode) => void | Promise<void>;
    /** Factory for a catalog leaf: the plugin calls it to create the node. */
    createNode: (entry: CatalogEntry) => () => OnshapeNode;
}

/**
 * `context` is `"root"` for a canvas right-click or the node under the
 * pointer. Root keeps the search bar and lists the catalog by category; a node
 * menu is actions only. Both get Copy/Paste/Delete.
 */
export function buildEditorContextMenuList(
    context: "root" | OnshapeNode,
    groups: readonly CategoryGroup[],
    actions: EditorContextMenuActions,
    bindings: ShortcutBindings,
): { searchBar: boolean; list: EditorContextMenuItem[] } {
    const isRoot = context === "root";
    // Only a real node is an action target; a wire right-click arrives here as
    // a Connection and must not be passed to copy/remove as if it were a node.
    const node = isRoot || typeof (context as OnshapeNode).getTitle !== "function"
        ? undefined
        : (context as OnshapeNode);

    const actionRows: EditorContextMenuItem[] = [
        {
            key: "copy",
            label: "Copy",
            icon: ACTION_ICONS.copy,
            shortcut: shortcutChipLabel(bindings.copy),
            handler: () => actions.copy(node),
        },
        {
            key: "paste",
            label: "Paste",
            icon: ACTION_ICONS.paste,
            shortcut: shortcutChipLabel(bindings.paste),
            handler: () => actions.paste(),
        },
        {
            key: "delete",
            label: "Delete",
            icon: ACTION_ICONS.delete,
            shortcut: shortcutChipLabel(bindings.deleteSelected),
            handler: () => actions.remove(node),
        },
    ];

    // A node right-click is actions only: the catalog/search belongs to the
    // canvas menu, where "add a node here" is what the click means.
    const categories: EditorContextMenuItem[] = isRoot
        ? groups.map((group, index) => ({
            key: `category:${group.category}`,
            label: group.category,
            icon: iconForCategory(group.category),
            sectionStart: index === 0,
            handler: () => undefined,
            subitems: group.entries.map((entry) => ({
                key: `node:${group.category}:${entry.key}`,
                label: entry.name,
                icon: iconForCatalogEntry(entry),
                // The plugin calls this and adds the returned node itself; the
                // Item type only promises a void handler, so widen at the edge.
                handler: actions.createNode(entry) as unknown as () => void,
            })),
        }))
        : [];

    return { searchBar: isRoot, list: [...actionRows, ...categories] };
}
