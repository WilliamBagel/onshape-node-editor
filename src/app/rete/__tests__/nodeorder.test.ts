import { describe, expect, it, vi } from "vitest";
import type { BaseAreaPlugin } from "rete-area-plugin";
import type { Schemes } from "../types";
import {
    NodeOrderKeeper,
    addNodeToOrder,
    appendMissingNodes,
    dropUnknownNodes,
    installNodeOrder,
    raiseNodes,
    reconcileOrder,
    removeNodeFromOrder,
} from "../modified-rete/nodeorder";

/**
 * A stand-in for the area content holder: `Content.reorder(target, next)` is
 * `holder.insertBefore(target, next)` plus a `reordered` signal, and the real
 * DOM `insertBefore` moves an element that is already a child. That is all the
 * keeper is allowed to rely on.
 */
class FakeHolder {
    children: unknown[] = [];

    contains(node: unknown): boolean {
        return this.children.includes(node);
    }

    appendChild(node: unknown): unknown {
        this.children.push(node);
        return node;
    }

    insertBefore(target: unknown, next: unknown | null): unknown {
        const index = this.children.indexOf(target);
        if (index === -1) {
            throw new Error("content doesn't have 'target' for reordering");
        }
        if (next !== null && this.children.indexOf(next) === -1) {
            throw new Error("content doesn't have 'next' for reordering");
        }
        this.children.splice(index, 1);
        if (next === null) {
            this.children.push(target);
        } else {
            this.children.splice(this.children.indexOf(next), 0, target);
        }
        return target;
    }

    /** Ids of the node elements, in DOM order, with non-node children skipped. */
    nodeOrder(byElement: Map<unknown, string>): string[] {
        return this.children
            .map((child) => byElement.get(child))
            .filter((id): id is string => id != null);
    }
}

interface FakeArea {
    holder: FakeHolder;
    nodeViews: Map<string, { element: HTMLElement }>;
    pipes: Array<(context: unknown) => unknown>;
    reorderCalls: number;
    /** Append a non-node element, like the background or a connection SVG. */
    addLayer(): HTMLElement;
    /** Add a node view the way `AreaPlugin.addNodeView` does. */
    addView(id: string): void;
}

function createFakeArea(): FakeArea {
    const holder = new FakeHolder();
    const byElement = new Map<unknown, string>();
    const nodeViews = new Map<string, { element: HTMLElement }>();
    const state: FakeArea = {
        holder,
        nodeViews,
        pipes: [],
        reorderCalls: 0,
        addLayer() {
            const element = { layer: holder.children.length } as unknown as HTMLElement;
            holder.appendChild(element);
            return element;
        },
        addView(id: string) {
            const element = { node: id } as unknown as HTMLElement;
            byElement.set(element, id);
            nodeViews.set(id, { element });
            holder.appendChild(element);
        },
    };
    return state;
}

function asArea(fake: FakeArea): BaseAreaPlugin<Schemes, never> {
    const content = {
        holder: fake.holder,
        add() { },
        remove() { },
        reorder(target: unknown, next: unknown | null) {
            fake.reorderCalls += 1;
            fake.holder.insertBefore(target, next);
            return Promise.resolve();
        },
    };
    return {
        nodeViews: fake.nodeViews,
        area: { content },
        addPipe(pipe: (context: unknown) => unknown) {
            fake.pipes.push(pipe);
        },
    } as unknown as BaseAreaPlugin<Schemes, never>;
}

function domOrderOf(fake: FakeArea): string[] {
    const byElement = new Map<unknown, string>();
    for (const [id, view] of fake.nodeViews) {
        byElement.set(view.element, id);
    }
    return fake.holder.nodeOrder(byElement);
}

async function flush(): Promise<void> {
    // `apply()` awaits one `content.reorder` per moved node.
    for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
    }
}

describe("node order (pure)", () => {
    it("raises a node above every unselected node", () => {
        expect(raiseNodes(["a", "b", "c"], ["a"])).toEqual(["b", "c", "a"]);
        expect(raiseNodes(["a", "b", "c"], ["b"])).toEqual(["a", "c", "b"]);
    });

    it("leaves the order alone when nothing is raised (deselect keeps the position)", () => {
        const order = ["b", "c", "a"];
        expect(raiseNodes(order, [])).toEqual(order);
        expect(addNodeToOrder(order, "b")).toEqual(order);
        expect(removeNodeFromOrder(order, "zzz")).toEqual(order);
    });

    it("raises every selected node and keeps their relative order", () => {
        expect(raiseNodes(["a", "b", "c", "d"], ["b", "d"])).toEqual(["a", "c", "b", "d"]);
        // The caller's id order does not override the list's existing order.
        expect(raiseNodes(["a", "b", "c", "d"], ["d", "b"])).toEqual(["a", "c", "b", "d"]);
    });

    it("is a no-op when the raised node is already on top", () => {
        const order = ["a", "b", "c"];
        expect(raiseNodes(order, ["c"])).toEqual(order);
        expect(raiseNodes(order, ["c", "c"])).toEqual(order);
    });

    it("appends ids that are not in the list yet, in the given order", () => {
        expect(raiseNodes(["a"], ["y", "x"])).toEqual(["a", "y", "x"]);
        expect(raiseNodes(["a"], ["x", "y", "x"])).toEqual(["a", "x", "y"]);
    });

    it("keeps the rest in order when a node is removed", () => {
        expect(removeNodeFromOrder(["a", "b", "c"], "b")).toEqual(["a", "c"]);
        expect(removeNodeFromOrder(["a", "b", "c"], "a")).toEqual(["b", "c"]);
    });

    it("drops unknown ids and appends new nodes deterministically", () => {
        expect(dropUnknownNodes(["ghost", "a", "a", "b"], ["a", "b"])).toEqual(["a", "b"]);
        expect(appendMissingNodes(["b"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
        expect(reconcileOrder(["ghost", "a"], ["a", "b"])).toEqual(["a", "b"]);
    });
});

describe("node order keeper", () => {
    it("seeds from the nodes already on the canvas and paints them in list order", async () => {
        const fake = createFakeArea();
        fake.addLayer();
        fake.addView("a");
        fake.addView("b");
        fake.addView("c");

        const keeper = new NodeOrderKeeper(asArea(fake));
        expect(keeper.getOrder()).toEqual([]);

        await keeper.setOrder(["c", "a", "b"]);

        expect(domOrderOf(fake)).toEqual(["c", "a", "b"]);
        expect(keeper.getOrder()).toEqual(["c", "a", "b"]);
        expect(keeper.isApplied(["c", "a", "b"])).toBe(true);
    });

    it("raises the selection and leaves it there once deselected", async () => {
        const fake = createFakeArea();
        fake.addLayer();
        for (const id of ["a", "b", "c"]) {
            fake.addView(id);
        }
        const keeper = new NodeOrderKeeper(asArea(fake));
        await keeper.setOrder(["a", "b", "c"]);

        await keeper.raise(["a"]);
        expect(domOrderOf(fake)).toEqual(["b", "c", "a"]);

        // Deselecting emits no order event at all, so nothing drops back.
        expect(domOrderOf(fake)).toEqual(["b", "c", "a"]);
        expect(keeper.getOrder()).toEqual(["b", "c", "a"]);
    });

    it("does not touch the DOM when the same node is selected again (idempotent)", async () => {
        const fake = createFakeArea();
        for (const id of ["a", "b", "c"]) {
            fake.addView(id);
        }
        const keeper = new NodeOrderKeeper(asArea(fake));
        await keeper.setOrder(["a", "b", "c"]);

        await keeper.raise(["a"]);
        const callsAfterFirstRaise = fake.reorderCalls;
        await keeper.raise(["a"]);
        await keeper.raise(["a"]);

        expect(fake.reorderCalls).toBe(callsAfterFirstRaise);
        expect(domOrderOf(fake)).toEqual(["b", "c", "a"]);
    });

    it("raises a multi-selection above the unselected, preserving relative order", async () => {
        const fake = createFakeArea();
        for (const id of ["a", "b", "c", "d"]) {
            fake.addView(id);
        }
        const keeper = new NodeOrderKeeper(asArea(fake));
        await keeper.setOrder(["a", "b", "c", "d"]);

        await keeper.raise(["d", "b"]);

        expect(domOrderOf(fake)).toEqual(["a", "c", "b", "d"]);
    });

    it("puts a new node on top and keeps the removed node out of the list", async () => {
        const fake = createFakeArea();
        for (const id of ["a", "b"]) {
            fake.addView(id);
        }
        const keeper = new NodeOrderKeeper(asArea(fake));
        await keeper.setOrder(["a", "b"]);

        fake.addView("c");
        await keeper.addNode("c");
        expect(domOrderOf(fake)).toEqual(["a", "b", "c"]);

        await keeper.removeNode("b");
        expect(keeper.getOrder()).toEqual(["a", "c"]);
    });

    it("paints above a connection layer that was appended after the nodes", async () => {
        const fake = createFakeArea();
        fake.addLayer();
        for (const id of ["a", "b"]) {
            fake.addView(id);
        }
        const keeper = new NodeOrderKeeper(asArea(fake));
        await keeper.setOrder(["a", "b"]);
        expect(keeper.isApplied(["a", "b"])).toBe(true);

        // A connection element is appended on top of the nodes by the area plugin.
        const connection = fake.addLayer();
        expect(fake.holder.children[fake.holder.children.length - 1]).toBe(connection);
        expect(keeper.isApplied(["a", "b"])).toBe(false);

        await keeper.apply();
        expect(domOrderOf(fake)).toEqual(["a", "b"]);
        expect(keeper.isApplied(["a", "b"])).toBe(true);
        expect(fake.holder.children[fake.holder.children.length - 1]).toBe(fake.nodeViews.get("b")?.element);
    });

    it("hooks the canvas: nodepicked raises the selection, nodecreated/noderemoved follow", async () => {
        const fake = createFakeArea();
        for (const id of ["a", "b"]) {
            fake.addView(id);
        }
        let selected: string[] = [];

        const keeper = installNodeOrder(asArea(fake), { getSelectedIds: () => selected });
        await keeper.setOrder(["a", "b"]);

        selected = ["a"];
        fake.pipes.forEach((pipe) => pipe({ type: "nodepicked", data: { id: "a" } }));
        await flush();
        expect(domOrderOf(fake)).toEqual(["b", "a"]);

        // The area plugin has already added the view when `nodecreated` reaches us.
        fake.addView("c");
        fake.pipes.forEach((pipe) => pipe({ type: "nodecreated", data: { id: "c" } }));
        await flush();
        expect(domOrderOf(fake)).toEqual(["b", "a", "c"]);

        // The area plugin has already removed the view when `noderemoved` reaches us.
        const removed = fake.nodeViews.get("a");
        fake.nodeViews.delete("a");
        if (removed) {
            fake.holder.children.splice(fake.holder.children.indexOf(removed.element), 1);
        }
        fake.pipes.forEach((pipe) => pipe({ type: "noderemoved", data: { id: "a" } }));
        await flush();
        expect(keeper.getOrder()).toEqual(["b", "c"]);
    });

    it("re-applies the node order when a connection is created", async () => {
        const fake = createFakeArea();
        for (const id of ["a", "b"]) {
            fake.addView(id);
        }
        const keeper = installNodeOrder(asArea(fake), { getSelectedIds: () => [] });
        await keeper.setOrder(["a", "b"]);

        fake.addLayer();
        expect(keeper.isApplied(["a", "b"])).toBe(false);

        fake.pipes.forEach((pipe) => pipe({ type: "connectioncreated", data: { id: "c1" } }));
        await flush();

        expect(keeper.isApplied(["a", "b"])).toBe(true);
    });

    it("survives an unrelated signal untouched", async () => {
        const fake = createFakeArea();
        fake.addView("a");
        const keeper = installNodeOrder(asArea(fake), { getSelectedIds: () => [] });
        await keeper.setOrder(["a"]);

        const handler = vi.fn();
        fake.pipes.forEach((pipe) => handler(pipe({ type: "zoomed", data: {} })));

        expect(handler).toHaveBeenCalledTimes(1);
        expect(domOrderOf(fake)).toEqual(["a"]);
    });
});
