/**
 * Node placement clamp (node-placement card).
 *
 * New nodes used to be placed verbatim at the last pointer position (or the
 * viewport centre). A click near the bottom edge — or a stale pointer left
 * there by a defocus click — therefore dropped the node mostly behind the
 * Build Log / bottom bar or below the viewport, where it was invisible.
 *
 * `clampNodePlacement` is the pure policy: given a desired world top-left, the
 * node's rendered size in world units, the canvas pan/zoom transform, the
 * container size in screen px, the screen-px height reserved at the bottom
 * (Build Log + bottom bar) and a screen-px margin, it returns the closest
 * world top-left that keeps the whole node inside the usable canvas. A node
 * already fully visible is returned unchanged; a node larger than the usable
 * area is pinned to the top-left of the usable area (best effort).
 */

export interface PlacementPoint {
    x: number;
    y: number;
}

export interface PlacementSize {
    width: number;
    height: number;
}

export interface PlacementRect {
    width: number;
    height: number;
}

export interface PlacementTransform {
    x: number;
    y: number;
    k: number;
}

export interface ClampNodePlacementInput {
    /** Desired world top-left of the node. */
    desired: PlacementPoint;
    /** Rendered node size in world (canvas) units. */
    size: PlacementSize;
    /** Canvas pan/zoom: screen = world * k + (x, y). */
    transform: PlacementTransform;
    /** Canvas container size in screen px. */
    containerRect: PlacementRect;
    /** Screen px reserved at the bottom (Build Log / bottom bar). */
    reservedBottom?: number;
    /** Screen px margin kept inside the usable canvas on every side. */
    margin?: number;
}

function clampAxis(value: number, min: number, max: number): number {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}

/**
 * Clamp a node's world top-left so the node stays fully inside the visible
 * canvas (above the reserved bottom strip) with `margin` screen px to spare.
 */
export function clampNodePlacement(input: ClampNodePlacementInput): PlacementPoint {
    const k = Number.isFinite(input.transform.k) && input.transform.k > 0 ? input.transform.k : 1;
    const margin = Math.max(0, input.margin ?? 12);
    const reservedBottom = Math.max(0, input.reservedBottom ?? 0);
    const usableWidth = Math.max(0, input.containerRect.width - margin * 2);
    const usableHeight = Math.max(0, input.containerRect.height - reservedBottom - margin * 2);
    // World coordinates of the usable area's top-left and bottom-right.
    const minX = (margin - input.transform.x) / k;
    const minY = (margin - input.transform.y) / k;
    const maxX = minX + usableWidth / k;
    const maxY = minY + usableHeight / k;
    return {
        x: clampAxis(input.desired.x, minX, maxX - input.size.width),
        y: clampAxis(input.desired.y, minY, maxY - input.size.height),
    };
}

/** Screen-space top-left of a world point under the given transform. */
export function worldToScreen(point: PlacementPoint, transform: PlacementTransform): PlacementPoint {
    const k = Number.isFinite(transform.k) && transform.k > 0 ? transform.k : 1;
    return { x: point.x * k + transform.x, y: point.y * k + transform.y };
}
