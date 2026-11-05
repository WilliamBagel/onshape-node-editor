import { describe, expect, it, vi } from "vitest";
import {
    BACKGROUND_Z_INDEX,
    FRAME_PADDING,
    FRAME_Z_INDEX,
    computeFrameBounds,
    installFrameSizeSync,
    measureElementSize,
    pinFrameElement,
    syncNodeSize,
    type SizableNode,
} from "../modified-rete/frame-layout";
import { CONNECTION_RAISED_Z_INDEX, CONNECTION_Z_INDEX } from "../modified-rete/connection-raise";

function fakeElement(overrides: Record<string, unknown> = {}): HTMLElement {
    return {
        getBoundingClientRect: () => ({ width: 220, height: 150 }),
        offsetWidth: 220,
        offsetHeight: 150,
        clientWidth: 220,
        clientHeight: 150,
        scrollWidth: 220,
        scrollHeight: 150,
        style: {} as CSSStyleDeclaration,
        ...overrides,
    } as unknown as HTMLElement;
}

describe("computeFrameBounds", () => {
    it("encloses every box with 16px padding on all sides", () => {
        const bounds = computeFrameBounds([
            { left: 100, top: 50, right: 320, bottom: 200 },
            { left: 400, top: 300, right: 620, bottom: 450 },
        ]);
        expect(bounds).toEqual({ left: 84, top: 34, width: 552, height: 432 });
        expect(bounds.left).toBe(100 - FRAME_PADDING);
        expect(bounds.top).toBe(50 - FRAME_PADDING);
    });

    it("returns zero bounds for no boxes", () => {
        expect(computeFrameBounds([])).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    });

    it("uses measured (expanded) sizes, not stale model sizes", () => {
        // A node whose model says 220x150 but whose rendered content is
        // 220x420 (expanded Definition) must drive the frame height.
        const element = fakeElement({ scrollHeight: 420, offsetHeight: 150 });
        const size = measureElementSize(element, 1);
        expect(size).toEqual({ width: 220, height: 420 });

        const bounds = computeFrameBounds([
            { left: 0, top: 0, right: size.width, bottom: size.height },
        ]);
        expect(bounds.height).toBe(420 + 2 * FRAME_PADDING);
    });

    it("divides the bounding rect by zoom but not the scroll size", () => {
        const element = fakeElement({
            getBoundingClientRect: () => ({ width: 440, height: 300 }),
            offsetWidth: 0,
            offsetHeight: 0,
            clientWidth: 0,
            clientHeight: 0,
            scrollWidth: 0,
            scrollHeight: 0,
        });
        expect(measureElementSize(element, 2)).toEqual({ width: 220, height: 150 });
    });
});

describe("syncNodeSize", () => {
    it("writes the rendered size into the model the scopes plugin reads", () => {
        const node: SizableNode = { id: "n", width: 220, height: 150, group: "f" };
        const view = { element: fakeElement({ scrollHeight: 420 }), position: { x: 0, y: 0 } };
        expect(syncNodeSize(node, view, 1)).toBe(true);
        expect(node).toMatchObject({ width: 220, height: 420 });

        // No change on the second pass: no refit loop.
        expect(syncNodeSize(node, view, 1)).toBe(false);
    });

    it("is a no-op without a view", () => {
        const node: SizableNode = { id: "n", width: 220, height: 150, group: null };
        expect(syncNodeSize(node, undefined, 1)).toBe(false);
    });
});

describe("frame layering", () => {
    it("stacks background < frame < connection < raised connection < node", () => {
        expect(BACKGROUND_Z_INDEX).toBeLessThan(FRAME_Z_INDEX);
        expect(FRAME_Z_INDEX).toBeLessThan(CONNECTION_Z_INDEX); // OutlineConnection svg z-index
        expect(CONNECTION_Z_INDEX).toBeLessThan(CONNECTION_RAISED_Z_INDEX); // selected node raise
        expect(CONNECTION_RAISED_Z_INDEX).toBeLessThan(0); // node wrappers
    });

    it("pins the frame element after the background with the frame z-index", () => {
        const background = fakeElement();
        background.classList = { contains: () => false } as never;
        const connection = fakeElement();
        const frame = fakeElement();
        const node = fakeElement();
        const children = [background, connection, frame, node];
        const holder = {
            children,
            firstChild: background,
            querySelector: (selector: string) =>
                selector.includes("background") || selector.includes("fill-area") ? background : null,
            insertBefore(target: HTMLElement, reference: HTMLElement | null) {
                const from = children.indexOf(target);
                if (from >= 0) children.splice(from, 1);
                const at = reference == null ? children.length : children.indexOf(reference);
                children.splice(at, 0, target);
                return target;
            },
        } as unknown as HTMLElement;
        // nextSibling wiring the pin helper relies on.
        Object.defineProperty(background, "nextSibling", { get: () => connection });
        (frame as { parentNode: unknown }).parentNode = holder;

        pinFrameElement(holder, frame);

        expect((frame.style as unknown as Record<string, string>).zIndex).toBe(String(FRAME_Z_INDEX));
        expect(children.indexOf(background)).toBeLessThan(children.indexOf(frame));
        expect(children.indexOf(frame)).toBeLessThan(children.indexOf(connection));
    });
});

describe("installFrameSizeSync", () => {
    it("re-fits the parent frame when a grouped node's rendered size changes", async () => {
        const child: SizableNode = { id: "child", width: 220, height: 150, group: "frame" };
        const frame: SizableNode = { id: "frame", width: 100, height: 100, group: null };
        const element = fakeElement({ scrollHeight: 420 });
        (element as { firstElementChild: null }).firstElementChild = null;
        const nodeViews = new Map([
            ["child", { element, position: { x: 0, y: 0 } }],
            ["frame", { element: fakeElement(), position: { x: 0, y: 0 } }],
        ]);
        const pipes: Array<(context: unknown) => unknown> = [];
        const area = {
            nodeViews,
            area: { transform: { k: 1 } },
            addPipe(pipe: (context: unknown) => unknown) {
                pipes.push(pipe);
                return () => { };
            },
        };
        const scopes = { update: vi.fn(async (_id: string) => { }) };
        const host = {
            area,
            editor: {
                getNodes: () => [child, frame],
                getNode: (id: string) => [child, frame].find((n) => n.id === id),
            },
            scopes,
            isFrame: (id: string) => id === "frame",
        };
        const sync = installFrameSizeSync(host as never);

        for (const pipe of pipes) {
            pipe({ type: "noderesized", data: { id: "child" } });
        }
        // Flush the scheduled (rAF/microtask) refit.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(child.height).toBe(420);
        expect(scopes.update).toHaveBeenCalledWith("frame");
        sync.dispose();
    });
});
