/**
 * Raise connections incident to the selected node above the other
 * connections — without changing node paint order.
 *
 * Paint layers in the area content holder (see frame-layout.ts):
 *
 *   background -10  <  frame -6  <  connection -5  <  raised connection -4
 *                 <  node 0 (DOM order via NodeOrderKeeper)
 *
 * The raise is a `connection-node-selected` class on the connection SVG
 * (`OutlineConnection.vue`), taking it from z-index -5 to z-index -4. That
 * is enough for the requirement — incident edges paint above unrelated
 * edges — while nodes stay above every edge, exactly as before.
 *
 * Trade-off, made explicit: the only way to put a connection above *nodes*
 * is z-index >= 1, which would hide ports/sockets under the wire and break
 * picking. That is deliberately not done. `-4` buys connection-vs-connection
 * priority only; where a wire crosses a node body it still goes under it.
 */
import { ref } from "vue";
import type { BaseAreaPlugin } from "rete-area-plugin";
import type { BaseSchemes } from "rete";

/** Default connection SVG z-index (OutlineConnection.vue). */
export const CONNECTION_Z_INDEX = -5;
/** Z-index of a connection incident to the selected node. */
export const CONNECTION_RAISED_Z_INDEX = -4;
/** Class OutlineConnection.vue applies when a connection is raised. */
export const CONNECTION_RAISED_CLASS = "connection-node-selected";

/**
 * Ids of the nodes selected right now, shared reactively with every
 * OutlineConnection view. `installConnectionRaise` (or editorbase's
 * selector-mutation wiring) replaces this on every selection change;
 * `OutlineConnection.vue`'s computed `raised` reads it, so the class is
 * re-evaluated on each render without touching the DOM imperatively.
 */
export const selectedNodeIds = ref<string[]>([]);

/** Replace the shared selection (a copy, so later mutation cannot leak in). */
export function setSelectedNodeIds(ids: readonly string[]): void {
    selectedNodeIds.value = [...ids];
}

/** A connection with the edge endpoints the raise cares about. */
export interface IncidentConnection {
    id: string;
    source: string;
    target: string;
}

/** True when the connection has an endpoint among the selected nodes. */
export function isConnectionRaised(
    connection: IncidentConnection,
    selectedIds: readonly string[]
): boolean {
    return selectedIds.includes(connection.source) || selectedIds.includes(connection.target);
}

/** Ids of every connection incident to `selectedIds`. */
export function incidentConnectionIds(
    connections: readonly IncidentConnection[],
    selectedIds: readonly string[]
): Set<string> {
    const selected = new Set(selectedIds);
    return new Set(connections.filter((c) => selected.has(c.source) || selected.has(c.target)).map((c) => c.id));
}

export interface ConnectionRaiseHooks {
    /** Node ids selected right now (selector entities labelled `node`). */
    getSelectedIds: () => string[];
}

/** Publish the selector's current selection to every connection view. */
export function syncConnectionRaise(hooks: ConnectionRaiseHooks): void {
    setSelectedNodeIds(hooks.getSelectedIds());
}

/**
 * Keep the shared selection in sync with the area. The primary sync is the
 * selector-mutation wiring in editorbase (it sees loads, programmatic
 * selects, background-click deselection via `unselectAll`, everything); this
 * pipe is a backstop so a stray signal re-reads the selector rather than
 * going stale.
 */
export function installConnectionRaise<Schemes extends BaseSchemes, Signals>(
    area: BaseAreaPlugin<Schemes, Signals>,
    hooks: ConnectionRaiseHooks
): void {
    syncConnectionRaise(hooks);
    area.addPipe((context) => {
        const signal = context as { type?: string };
        switch (signal.type) {
            case "nodepicked":
            case "pointerup":
            case "nodecreated":
            case "noderemoved":
            case "connectioncreated":
            case "connectionremoved":
                syncConnectionRaise(hooks);
                break;
            default:
                break;
        }
        return context;
    });
}
