import { describe, expect, it } from "vitest";
import { clampNodePlacement } from "../modified-rete/node-placement";

const container = { width: 1280, height: 900 };
const identity = { x: 0, y: 0, k: 1 };
const size = { width: 220, height: 150 };

describe("clampNodePlacement", () => {
    it("is a no-op when the node is already fully visible", () => {
        expect(
            clampNodePlacement({ desired: { x: 100, y: 100 }, size, transform: identity, containerRect: container, reservedBottom: 0, margin: 12 })
        ).toEqual({ x: 100, y: 100 });
    });

    it("clamps an offscreen-bottom position into view above the reserved bottom", () => {
        const result = clampNodePlacement({
            desired: { x: 640, y: 820 },
            size,
            transform: identity,
            containerRect: container,
            reservedBottom: 200,
            margin: 12,
        });
        // Bottom edge = 900 - 200 - 12 = 688; top = 688 - 150 = 538.
        expect(result).toEqual({ x: 640, y: 538 });
        expect(result.y + size.height).toBeLessThanOrEqual(900 - 200 - 12);
    });

    it("clamps an offscreen-right position into view", () => {
        const result = clampNodePlacement({
            desired: { x: 1200, y: 100 },
            size,
            transform: identity,
            containerRect: container,
            reservedBottom: 0,
            margin: 12,
        });
        expect(result.x + size.width).toBe(1280 - 12);
        expect(result.y).toBe(100);
    });

    it("clamps negative positions to the top-left margin", () => {
        expect(
            clampNodePlacement({ desired: { x: -500, y: -500 }, size, transform: identity, containerRect: container, reservedBottom: 0, margin: 12 })
        ).toEqual({ x: 12, y: 12 });
    });

    it("accounts for pan and zoom", () => {
        // Zoom 2, pan (100, 50): screen x = world * 2 + 100.
        const result = clampNodePlacement({
            desired: { x: 2000, y: 1000 },
            size,
            transform: { x: 100, y: 50, k: 2 },
            containerRect: container,
            reservedBottom: 0,
            margin: 12,
        });
        // Right edge in world: (1280 - 12 - 100) / 2 = 584; minus width 220.
        expect(result.x).toBe(584 - 220);
        // Bottom edge in world: (900 - 12 - 50) / 2 = 419; minus height 150.
        expect(result.y).toBe(419 - 150);
        // And the rendered rect really is inside the container on screen.
        expect(result.x * 2 + 100 + size.width * 2).toBeLessThanOrEqual(1280 - 12);
        expect(result.y * 2 + 50 + size.height * 2).toBeLessThanOrEqual(900 - 12);
    });

    it("pins a too-large node to the usable top-left", () => {
        const result = clampNodePlacement({
            desired: { x: 500, y: 500 },
            size: { width: 2000, height: 2000 },
            transform: identity,
            containerRect: container,
            reservedBottom: 0,
            margin: 12,
        });
        expect(result).toEqual({ x: 12, y: 12 });
    });

    it("treats the reserved bottom strip as not usable", () => {
        // Without the reserve this y would be fine; with it, it must move up.
        const visible = clampNodePlacement({
            desired: { x: 100, y: 600 },
            size,
            transform: identity,
            containerRect: container,
            reservedBottom: 0,
            margin: 12,
        });
        const reserved = clampNodePlacement({
            desired: { x: 100, y: 600 },
            size,
            transform: identity,
            containerRect: container,
            reservedBottom: 180,
            margin: 12,
        });
        expect(visible.y).toBe(600);
        expect(reserved.y + size.height).toBeLessThanOrEqual(900 - 180 - 12);
        expect(reserved.y).toBeLessThan(600);
    });

    it("defaults margin to 12 and reservedBottom to 0", () => {
        expect(
            clampNodePlacement({ desired: { x: 100, y: 100 }, size, transform: identity, containerRect: container })
        ).toEqual({ x: 100, y: 100 });
    });
});
