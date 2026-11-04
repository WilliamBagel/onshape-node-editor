import EditorContextMenu from "../customization/EditorContextMenu.vue";

interface ContextMenuEvent {
  type: string;
  data: {
    type?: string;
    items: unknown;
    searchBar: unknown;
    onHide: () => void;
  };
}

/**
 * Replacement for VuePresets.contextMenu. The vendor menu only filters its
 * top-level rows, so leaf nodes inside categories were not searchable; the
 * custom component searches the whole tree and clamps itself to the viewport.
 */
export function editorContextMenuPreset(delay = 1000) {
  const props = (context: ContextMenuEvent) => ({
    items: context.data.items,
    delay,
    searchBar: context.data.searchBar,
    onHide: context.data.onHide,
  });
  return {
    update(context: ContextMenuEvent) {
      if (context.data.type === "contextmenu") return props(context);
      return undefined;
    },
    render(context: ContextMenuEvent) {
      if (context.data.type === "contextmenu") {
        return { component: EditorContextMenu, props: props(context) };
      }
      return undefined;
    },
  };
}
