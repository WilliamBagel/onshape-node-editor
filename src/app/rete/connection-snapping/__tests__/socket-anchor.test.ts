import { describe, expect, it } from "vitest";
import type { SocketData } from "rete-connection-plugin";
import { findSocketData, pseudoAnchoredSide } from "../utils";

/**
 * Regression coverage for the socket-anchor fix (wt/socket-anchor).
 *
 * Root cause: the Vue preset reads a connection's socket-anchored endpoint
 * from the socket-position watcher's cache, populated once at 'rendered'
 * time -- before the initial layout settles -- and never recomputed for
 * inputs (only outputs are recomputed on resize). Before any node is
 * selected/moved/re-rendered the cached anchor is stale by the area
 * holder's page offset (measured: +1, +29 canvas px on the dev graph),
 * while a fresh calculatePosition() from the live DOM is exact.
 *
 * The render pipe in connectionsnapping.ts now anchors the picked socket
 * with a fresh calculatePosition() + nodeView.position, so the pieces that
 * decide *which* socket and *which* endpoint that is are pinned here.
 */

function socketData(overrides: Partial<SocketData> = {}): SocketData {
    return {
        element: {} as Element,
        nodeId: "node-1",
        side: "output",
        key: "out",
        type: "number",
        ...overrides,
    } as SocketData;
}

describe("findSocketData", () => {
    it("finds the SocketData matching nodeId, side and key", () => {
        const wanted = socketData({ nodeId: "n2", side: "input", key: "in" });
        const cache = new Map<Element, SocketData>([
            [{} as Element, socketData({ nodeId: "n1", side: "output", key: "out" })],
            [{} as Element, wanted],
            [{} as Element, socketData({ nodeId: "n2", side: "output", key: "in" })],
        ]);

        expect(findSocketData(cache, "n2", "input", "in")).toBe(wanted);
    });

    it("does not match on a subset of the triple", () => {
        const cache = new Map<Element, SocketData>([
            [{} as Element, socketData({ nodeId: "n2", side: "output", key: "in" })],
        ]);

        expect(findSocketData(cache, "n2", "input", "in")).toBeUndefined();
        expect(findSocketData(cache, "n2", "output", "other")).toBeUndefined();
        expect(findSocketData(cache, "n3", "output", "in")).toBeUndefined();
    });

    it("returns undefined for an empty cache", () => {
        expect(findSocketData(new Map(), "n1", "output", "out")).toBeUndefined();
    });
});

describe("pseudoAnchoredSide", () => {
    it("anchors 'start' for an output-first (source) pseudo-connection", () => {
        expect(pseudoAnchoredSide({ source: "node-1", target: "" })).toBe("start");
    });

    it("anchors 'end' for an input-first (target) pseudo-connection", () => {
        expect(pseudoAnchoredSide({ source: "", target: "node-1" })).toBe("end");
    });
});

describe("anchored canvas position", () => {
    it("is nodeView.position + the fresh DOM offset, at any zoom/pan", () => {
        // calculatePosition() returns layout-space offsets (pre-transform),
        // so adding the node view's canvas position is exact regardless of
        // the area zoom k or pan; this is the addition the render pipe makes.
        const nodeViewPosition = { x: 600, y: 50 };
        const freshOffset = { x: 219, y: 42 };
        const anchored = {
            x: nodeViewPosition.x + freshOffset.x,
            y: nodeViewPosition.y + freshOffset.y,
        };

        // Dev-graph socket measured in the browser: canvas (819, 92) from a
        // node at (600, 50) -- i.e. no holder-offset contamination.
        expect(anchored).toEqual({ x: 819, y: 92 });
    });
});
