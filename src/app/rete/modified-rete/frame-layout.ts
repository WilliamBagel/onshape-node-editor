/**
 * Frame sizing and layering (frame-layout card).
 *
 * Root causes fixed here:
 *
 * 1. Sizing: `rete-scopes-plugin` computes a scope's bounds from
 *    `node.width`/`node.height` (model state), but OnshapeNode's model
 *    size is stale — it is the 220x150 construction default and is never
 *    updated when the rendered node grows (expanded Definition/parameter
 *    content overflows the fixed-height box). A frame created from model
 *    sizes therefore comes out tiny/wrong until a drag (which triggers
 *    plugin's `resizeParent`) or a node repaints (which shrinks the
 *    content back to the model size). The fix is to measure the rendered
 *    node view, sync the model size from it, and only then let the scopes
 *    plugin fit the frame (`scopes.update` -> `scopeupdated` ->
 *    `resizeParent`). A ResizeObserver/MutationObserver keeps the model
 *    in sync afterwards, so expanding a node inside a frame re-fits it.
 *
 *    Frame collapsing does not exist: frames always stay expanded and no
 *    code path hides descendants (`collapsed` is a legacy schema field,
 *    normalized to false on construction/fromJSON — see framenode.ts).
 *
 * 2. Layering: paint order in the area holder is not pure DOM order.
 *    The canvas background (`background.css`) carries `z-index: -1` and
 *    every connection SVG (`OutlineConnection.vue`) carries
 *    `z-index: -5`, while node wrappers default to `z-index: auto` (0).
 *    A frame wrapper at 0 therefore paints over every connection that
 *    crosses it. Frames get `z-index: -6` (below connections at -5,
 *    above the background, which drops to -10), and are pinned in the
 *    holder directly after the background element. Nodes stay at 0 and
 *    above the frame, so they and their sockets remain interactive.
 *    Selected nodes additionally raise their incident connections to
 *    z-index -4 (above other connections only — see connection-raise.ts).
 *    This is a real stacking fix, not a translucent background.
 */
import type { BaseAreaPlugin } from "rete-area-plugin";
import type { BaseSchemes } from "rete";

export const FRAME_PADDING = 16;
/** Height of FrameNodeView's header; the frame label sits above the first child. */
export const FRAME_HEADER_HEIGHT = 30;
/** Below the connection layer (-5), above the background (-10). */
export const FRAME_Z_INDEX = -6;
export const BACKGROUND_Z_INDEX = -10;

export interface Size {
    width: number;
    height: number;
}

export interface FrameBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** Bounds enclosing every box with `padding` on all four sides. */
export function computeFrameBounds(
    boxes: readonly { left: number; top: number; right: number; bottom: number }[],
    padding: number = FRAME_PADDING,
    topExtra: number = 0
): FrameBounds {
    if (boxes.length === 0) {
        return { left: 0, top: 0, width: 0, height: 0 };
    }
    const left = Math.min(...boxes.map((box) => box.left)) - padding;
    const top = Math.min(...boxes.map((box) => box.top)) - padding - topExtra;
    const right = Math.max(...boxes.map((box) => box.right)) + padding;
    const bottom = Math.max(...boxes.map((box) => box.bottom)) + padding;
    return { left, top, width: right - left, height: bottom - top };
}

/**
 * Rendered size of a node view element in canvas units.
 *
 * `scrollWidth`/`scrollHeight` matter: OnshapeNode's root box has a
 * fixed inline height (the stale model height), so expanded parameter
 * content overflows it and `offsetHeight`/the bounding rect under-report
 * the visual height. The scroll size is the full content size.
 */
export function measureElementSize(
    element: {
        getBoundingClientRect(): { width: number; height: number };
        offsetWidth?: number;
        offsetHeight?: number;
        clientWidth?: number;
        clientHeight?: number;
        scrollWidth?: number;
        scrollHeight?: number;
    },
    zoom: number = 1
): Size {
    const k = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const rect = element.getBoundingClientRect();
    return {
        width: Math.max(
            rect.width / k,
            element.offsetWidth ?? 0,
            element.clientWidth ?? 0,
            element.scrollWidth ?? 0
        ),
        height: Math.max(
            rect.height / k,
            element.offsetHeight ?? 0,
            element.clientHeight ?? 0,
            element.scrollHeight ?? 0
        ),
    };
}

/** Node-shaped stand-in so this stays testable without a real editor. */
export interface SizableNode {
    id: string;
    width: number;
    height: number;
    group: string | null;
}

export interface NodeViewLike {
    element: HTMLElement;
    position: { x: number; y: number };
}

const SIZE_EPSILON = 0.5;

/**
 * Sync a node's model size from its rendered view (what the scopes
 * plugin reads). Returns true when the model size actually changed.
 */
export function syncNodeSize(
    node: SizableNode,
    view: NodeViewLike | undefined,
    zoom: number = 1
): boolean {
    if (view == null) {
        return false;
    }
    const size = measureElementSize(view.element, zoom);
    if (
        Math.abs(size.width - node.width) < SIZE_EPSILON &&
        Math.abs(size.height - node.height) < SIZE_EPSILON
    ) {
        return false;
    }
    node.width = size.width;
    node.height = size.height;
    return true;
}

/** The canvas background element inside the holder, if present. */
export function findBackgroundElement(holder: HTMLElement): HTMLElement | null {
    return holder.querySelector(".background, .fill-area");
}

/**
 * Pin a frame element to its paint layer: directly after the background
 * in DOM order and at FRAME_Z_INDEX, i.e. above the background, below
 * the connection SVGs (-5) and below every regular node (0).
 */
export function pinFrameElement(holder: HTMLElement, element: HTMLElement): void {
    element.style.zIndex = String(FRAME_Z_INDEX);
    if (element.parentNode !== holder) {
        return;
    }
    const background = findBackgroundElement(holder);
    const reference = background != null && background !== element
        ? background.nextSibling
        : holder.firstChild;
    if (reference !== element) {
        holder.insertBefore(element, reference);
    }
}

/** Zoom of the area content holder, or 1 when unavailable. */
export function areaZoom(area: { area?: unknown }): number {
    const transform = (area.area as { transform?: { k?: number } } | undefined)?.transform;
    const k = transform?.k;
    return typeof k === "number" && k > 0 ? k : 1;
}

export interface FrameRefitHost<Schemes extends BaseSchemes> {
    area: BaseAreaPlugin<Schemes, never>;
    editor: {
        getNodes(): SizableNode[];
        getNode(id: string): SizableNode | undefined;
    };
    scopes: { update(id: string): Promise<void> };
    isFrame(id: string): boolean;
}

/**
 * Keep model sizes in sync with rendered node views and re-fit the
 * parent frame (`scopes.update`) whenever a grouped node's rendered
 * size changes — e.g. a Definition dropdown expanding. The scopes
 * plugin only re-fits on translate/remove/scopeupdated, never on
 * content resize, so without this an expanded node outgrows its frame.
 */
export function installFrameSizeSync<Schemes extends BaseSchemes>(
    host: FrameRefitHost<Schemes>
): { dispose(): void } {
    const { area, editor, scopes } = host;
    const observed = new Map<string, HTMLElement>();
    const pending = new Set<string>();
    let scheduled = false;

    const refitNode = (id: string): void => {
        const node = editor.getNode(id);
        if (node == null) {
            return;
        }
        const changed = syncNodeSize(node, area.nodeViews.get(id), areaZoom(area));
        if (!changed || host.isFrame(id)) {
            return;
        }
        const parentId = node.group;
        if (parentId != null && editor.getNode(parentId) != null) {
            void scopes.update(parentId);
        }
    };

    const schedule = (id: string): void => {
        pending.add(id);
        if (scheduled) {
            return;
        }
        scheduled = true;
        const flush = (): void => {
            scheduled = false;
            const ids = [...pending];
            pending.clear();
            for (const id of ids) {
                refitNode(id);
            }
        };
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(flush);
        } else {
            void Promise.resolve().then(flush);
        }
    };

    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
        for (const entry of entries) {
            for (const [id, element] of observed) {
                if (entry.target === element || entry.target === element.firstElementChild) {
                    schedule(id);
                    break;
                }
            }
        }
    }) : null;

    const observe = (id: string): void => {
        const view = area.nodeViews.get(id);
        if (view == null || observed.has(id)) {
            return;
        }
        observed.set(id, view.element);
        resizeObserver?.observe(view.element);
        // Expanded content can overflow the fixed-height root box
        // without changing its border box, so watch the content too.
        if (view.element.firstElementChild != null) {
            resizeObserver?.observe(view.element.firstElementChild);
        }
        mutationObserver.observe(view.element, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
        });
    };

    const unobserve = (id: string): void => {
        const element = observed.get(id);
        if (element == null) {
            return;
        }
        resizeObserver?.unobserve(element);
        if (element.firstElementChild != null) {
            resizeObserver?.unobserve(element.firstElementChild);
        }
        mutationObserver.disconnect();
        observed.delete(id);
        // Re-observe the remaining nodes after the shared disconnect.
        for (const remaining of [...observed.keys()]) {
            const view = area.nodeViews.get(remaining);
            if (view != null) {
                mutationObserver.observe(view.element, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    characterData: true,
                });
            }
        }
    };

    const mutationObserver = typeof MutationObserver === "function"
        ? new MutationObserver((records) => {
            // Ignore the frame's own repositioning/resizing: only
            // content changes under a node matter here. Attribute
            // changes on the node root itself (transform from a drag)
            // are handled by the scopes plugin, not this sync.
            for (const record of records) {
                const target = record.target as HTMLElement;
                for (const [id, element] of observed) {
                    if (target === element || element.contains(target)) {
                        schedule(id);
                        break;
                    }
                }
            }
        })
        : { observe() { }, disconnect() { } };

    const pipe = area.addPipe((context) => {
        const signal = context as { type?: string; data?: { id?: string } };
        if (signal.type === "nodecreated" && signal.data?.id != null) {
            observe(signal.data.id);
        } else if (signal.type === "noderemoved" && signal.data?.id != null) {
            unobserve(signal.data.id);
        } else if (signal.type === "noderesized" && signal.data?.id != null) {
            schedule(signal.data.id);
        } else if (signal.type === "nodeupdated" && signal.data?.id != null) {
            schedule(signal.data.id);
        }
        return context;
    });

    for (const node of editor.getNodes()) {
        observe(node.id);
    }

    return {
        dispose(): void {
            // addPipe returns void in this rete version; the pipe dies
            // with the area, and the observers below are disconnected.
            void pipe;
            resizeObserver?.disconnect();
            mutationObserver.disconnect();
            observed.clear();
        },
    };
}
