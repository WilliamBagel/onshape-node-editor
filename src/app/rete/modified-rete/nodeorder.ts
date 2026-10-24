/**
 * Explicit node paint order (issue #27, DR-007).
 *
 * `rete-area-plugin` does not stack nodes with CSS: every node is an absolutely
 * positioned element inside the area content holder, so paint order is **DOM
 * order**. The plugin reorders those elements itself on interaction
 * (`AreaExtensions.simpleNodesOrder`, and the connection layer is moved to the
 * back on `connectioncreated`), which is why a `z-index` rule in the node
 * component and the plugin's DOM order can disagree — and the plugin wins.
 *
 * This module takes that ownership over. The order is a single explicit list of
 * node ids, **bottom-most first** (the last element paints on top), and it is
 * the same list the graph document stores as `nodeOrder`. The canvas is the
 * owner: it holds the list, applies it with `area.area.content.reorder(...)`
 * (the installed API — a `BaseAreaPlugin` has no `reorder` method of its own in
 * 2.1.5), and the serializer only records what the canvas reports.
 *
 * Selecting a node raises it and it stays raised: deselection does not touch the
 * list. Nothing else re-orders nodes, so there is no flicker to synchronize.
 */
import type { BaseSchemes } from "rete";
import type { BaseAreaPlugin } from "rete-area-plugin";

/** Node ids, bottom-most first: the last id paints on top. */
export type NodeOrder = string[];

/**
 * Move `ids` to the top of `order`, keeping the order they already have among
 * themselves. Ids not in `order` (a node that has no view yet) are appended in
 * the order given. Raising something that is already on top returns an equal
 * list, so repeated selection is a no-op.
 */
export function raiseNodes(order: readonly string[], ids: readonly string[]): NodeOrder {
    const raising = new Set(ids);
    if (raising.size === 0) {
        return [...order];
    }

    const kept = order.filter((id) => !raising.has(id));
    const raised = order.filter((id) => raising.has(id));

    // Ids that are not in the list yet keep the caller's order, so a raise of
    // several brand-new ids is still deterministic.
    for (const id of ids) {
        if (raising.has(id) && !raised.includes(id) && !order.includes(id)) {
            raised.push(id);
        }
    }

    return [...kept, ...raised];
}

/** Append a freshly created node at the top; an existing id is left alone. */
export function addNodeToOrder(order: readonly string[], id: string): NodeOrder {
    if (order.includes(id)) {
        return [...order];
    }
    return [...order, id];
}

/** Drop a removed node, leaving every other node in its relative position. */
export function removeNodeFromOrder(order: readonly string[], id: string): NodeOrder {
    return order.filter((candidate) => candidate !== id);
}

/** Keep the ids in `order` that still exist, first occurrence wins. */
export function dropUnknownNodes(order: readonly string[], nodeIds: readonly string[]): NodeOrder {
    const known = new Set(nodeIds);
    const seen = new Set<string>();
    const kept: NodeOrder = [];
    for (const id of order) {
        if (!known.has(id) || seen.has(id)) {
            continue;
        }
        seen.add(id);
        kept.push(id);
    }
    return kept;
}

/**
 * Append every node that the list does not mention, in `nodeIds` order (which is
 * creation order for a graph document and view order on the canvas). Appended
 * ids end up on top.
 */
export function appendMissingNodes(order: readonly string[], nodeIds: readonly string[]): NodeOrder {
    const present = new Set(order);
    const missing = nodeIds.filter((id) => !present.has(id));
    return [...order, ...missing];
}

/** The full reconciliation: drop ids that are gone, append ids that are new. */
export function reconcileOrder(order: readonly string[], nodeIds: readonly string[]): NodeOrder {
    return appendMissingNodes(dropUnknownNodes(order, nodeIds), nodeIds);
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Where the current selection can be read from (the area extension's selector). */
export interface NodeOrderHooks {
    /** Node ids that are selected right now, in selection order. */
    getSelectedIds: () => string[];
}

/**
 * Holds the paint order and applies it to the canvas.
 *
 * `raise`/`setOrder`/`apply` mutate the DOM synchronously and return a promise
 * that settles once the area has reported the reorder.
 */
export class NodeOrderKeeper<Schemes extends BaseSchemes, Signals> {
    private order: NodeOrder = [];
    private readonly area: BaseAreaPlugin<Schemes, Signals>;

    constructor(area: BaseAreaPlugin<Schemes, Signals>) {
        this.area = area;
    }

    /** The order to persist, bottom-most first. */
    getOrder(): NodeOrder {
        return [...this.order];
    }

    /** Adopt a saved order (a graph load) and paint the canvas with it. */
    async setOrder(order: readonly string[]): Promise<void> {
        this.order = [...order];
        await this.apply();
    }

    /** Raise `ids` above everything else, keeping their relative order. */
    async raise(ids: readonly string[]): Promise<void> {
        const next = raiseNodes(this.order, ids);
        if (sameOrder(this.order, next)) {
            return;
        }
        this.order = next;
        await this.apply();
    }

    /** A node appeared on the canvas: it paints on top. */
    async addNode(id: string): Promise<void> {
        this.order = addNodeToOrder(this.order, id);
        await this.apply();
    }

    /** A node left the canvas: it leaves the list. */
    async removeNode(id: string): Promise<void> {
        this.order = removeNodeFromOrder(this.order, id);
    }

    /**
     * Make the DOM agree with the list: every node element is moved to the end
     * of the area content holder, bottom-most first, so nodes also paint above
     * the canvas background and the connection layer (both of which carry a
     * negative `z-index` of their own).
     *
     * Skips the work when the DOM already matches, which is what keeps repeated
     * selection, dragging, panning, zooming and `area.resize()` free of churn.
     */
    async apply(): Promise<void> {
        this.order = appendMissingNodes(this.order, [...this.area.nodeViews.keys()]);

        const desired = this.order.filter((id) => this.area.nodeViews.has(id));
        if (this.isApplied(desired)) {
            return;
        }

        for (const id of desired) {
            const view = this.area.nodeViews.get(id);
            if (view == null) {
                continue;
            }
            await this.area.area.content.reorder(view.element, null);
        }
    }

    /**
     * True when the node elements are the last children of the holder and their
     * DOM order matches `desired`.
     */
    isApplied(desired: readonly string[]): boolean {
        if (desired.length === 0) {
            return true;
        }

        const holder = this.area.area.content.holder;
        const idByElement = new Map<HTMLElement, string>();
        for (const [id, view] of this.area.nodeViews) {
            idByElement.set(view.element, id);
        }

        const domOrder: string[] = [];
        let firstNodeIndex = -1;
        let lastNonNodeIndex = -1;

        Array.from(holder.children).forEach((child, index) => {
            const id = idByElement.get(child as HTMLElement);
            if (id == null) {
                lastNonNodeIndex = index;
                return;
            }
            if (firstNodeIndex === -1) {
                firstNodeIndex = index;
            }
            domOrder.push(id);
        });

        if (domOrder.length !== desired.length) {
            return false;
        }
        if (domOrder.some((id, index) => id !== desired[index])) {
            return false;
        }
        // Nodes must come after the background and the connection layer, or they
        // would paint underneath them.
        return firstNodeIndex > lastNonNodeIndex;
    }
}

/**
 * Install the keeper on an area: raise the selection on `nodepicked`, keep the
 * list coherent on `nodecreated`/`noderemoved`, and keep nodes above a newly
 * created connection element. The list starts empty and adopts whatever nodes
 * exist the first time the canvas is painted (`apply`), in view order.
 *
 * Deliberately NOT `AreaExtensions.simpleNodesOrder`: that extension listens to
 * `nodepicked` and reorders the DOM itself, which would make it a second owner
 * of the order this module persists (DR-007).
 */
export function installNodeOrder<Schemes extends BaseSchemes, Signals>(
    area: BaseAreaPlugin<Schemes, Signals>,
    hooks: NodeOrderHooks
): NodeOrderKeeper<Schemes, Signals> {
    const keeper = new NodeOrderKeeper(area);

    area.addPipe((context) => {
        const signal = context as { type?: string; data?: { id?: string } };

        switch (signal.type) {
            case "nodepicked":
                // The selectableNodes pipe has already resolved when this runs,
                // so the selector knows the whole (possibly accumulated) selection.
                void keeper.raise(hooks.getSelectedIds());
                break;
            case "nodecreated":
                if (signal.data?.id != null) {
                    void keeper.addNode(signal.data.id);
                }
                break;
            case "noderemoved":
                if (signal.data?.id != null) {
                    void keeper.removeNode(signal.data.id);
                }
                break;
            case "connectioncreated":
                // The connection element is appended to the holder, i.e. on top
                // of the nodes; put the nodes back on top.
                void keeper.apply();
                break;
            default:
                break;
        }

        return context;
    });

    return keeper;
}
