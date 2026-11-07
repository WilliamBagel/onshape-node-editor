/**
 * Regression test: LiveDOMSocketPosition must recompute INPUT sockets on
 * noderesized, not just outputs (rete-render-utils' BaseSocketPosition only
 * recomputes outputs — the wire-shift-down bug).
 *
 * The layout math is exercised for real: fake socket elements carry
 * offsetLeft/offsetTop + an offsetParent chain, exactly what getElementCenter
 * reads, so positions are measured from "live DOM geometry" rather than
 * whatever the mock returns.
 */
import { describe, expect, it, vi } from 'vitest';
import { LiveDOMSocketPosition } from '../connection-snapping/live-socket-position.js';

function fakeSocketElement(offsetTop: number, offsetLeft = 0): HTMLElement {
    const parent = {
        offsetLeft: 0,
        offsetTop: 0,
        clientLeft: 0,
        clientTop: 0,
        offsetParent: null,
    } as unknown as HTMLElement;
    return {
        offsetLeft,
        offsetTop,
        offsetParent: parent,
        offsetWidth: 8,
        offsetHeight: 8,
    } as unknown as HTMLElement;
}

/** DOMSocketPosition.calculatePosition reads area.nodeViews.get(nodeId); the
 *  fake views map to an element off the offsetParent chain, so centers come
 *  straight from the socket fakes above. */
function attachFakeArea(watcher: LiveDOMSocketPosition, nodeIds: string[]): void {
    (watcher as unknown as { area: unknown }).area = {
        nodeViews: new Map(nodeIds.map((id) => [id, { element: {}, position: { x: 0, y: 0 } }])),
    };
}

describe('LiveDOMSocketPosition', () => {
    it('recomputes BOTH input and output positions on recalcNode', async () => {
        const watcher = new LiveDOMSocketPosition({ offset: (p: { x: number; y: number }) => p });
        attachFakeArea(watcher, ["n1", "n2"]);
        const inputEl = fakeSocketElement(20);
        const outputEl = fakeSocketElement(64);
        watcher.sockets.add({ nodeId: 'n1', key: 'depth', side: 'input', element: inputEl, position: { x: 0, y: 0 } });
        watcher.sockets.add({ nodeId: 'n1', key: 'result', side: 'output', element: outputEl, position: { x: 0, y: 0 } });

        await watcher.recalcNode('n1');

        expect(watcher.sockets.getPosition({ nodeId: 'n1', key: 'depth', side: 'input' })).toEqual({ x: 4, y: 24 });
        expect(watcher.sockets.getPosition({ nodeId: 'n1', key: 'result', side: 'output' })).toEqual({ x: 4, y: 68 });
    });

    it('picks up a post-render layout shift (expanded node) without a drag', async () => {
        const watcher = new LiveDOMSocketPosition({ offset: (p: { x: number; y: number }) => p });
        attachFakeArea(watcher, ["n1", "n2"]);
        const inputEl = fakeSocketElement(20);
        watcher.sockets.add({ nodeId: 'n1', key: 'depth', side: 'input', element: inputEl, position: { x: 4, y: 24 } });

        // Map section expands: the socket moves down inside the node.
        (inputEl as { offsetTop: number }).offsetTop = 74;
        await watcher.recalcNode('n1');

        expect(watcher.sockets.getPosition({ nodeId: 'n1', key: 'depth', side: 'input' })).toEqual({ x: 4, y: 78 });
    });

    it('notifies listeners with the fresh position', async () => {
        const watcher = new LiveDOMSocketPosition({ offset: (p: { x: number; y: number }) => p });
        attachFakeArea(watcher, ["n1", "n2"]);
        const inputEl = fakeSocketElement(20);
        watcher.sockets.add({ nodeId: 'n1', key: 'depth', side: 'input', element: inputEl, position: { x: 0, y: 0 } });

        const seen: unknown[] = [];
        watcher.listen('n1', 'input', 'depth', (pos) => seen.push(pos));

        (inputEl as { offsetTop: number }).offsetTop = 50;
        await watcher.recalcNode('n1');

        expect(seen).toContainEqual({ x: 4, y: 54 });
    });

    it('recalcAll covers every node', async () => {
        const watcher = new LiveDOMSocketPosition({ offset: (p: { x: number; y: number }) => p });
        attachFakeArea(watcher, ["n1", "n2"]);
        watcher.sockets.add({
            nodeId: 'n1',
            key: 'a',
            side: 'input',
            element: fakeSocketElement(10),
            position: { x: 0, y: 0 },
        });
        watcher.sockets.add({
            nodeId: 'n2',
            key: 'b',
            side: 'output',
            element: fakeSocketElement(30),
            position: { x: 0, y: 0 },
        });

        await watcher.recalcAll();

        expect(watcher.sockets.getPosition({ nodeId: 'n1', key: 'a', side: 'input' })).toEqual({ x: 4, y: 14 });
        expect(watcher.sockets.getPosition({ nodeId: 'n2', key: 'b', side: 'output' })).toEqual({ x: 4, y: 34 });
    });

    it('does not emit for other nodes but still updates the stored socket', async () => {
        const watcher = new LiveDOMSocketPosition({ offset: (p: { x: number; y: number }) => p });
        attachFakeArea(watcher, ["n1", "n2"]);
        const emit = vi.spyOn(watcher.emitter, 'emit');
        watcher.sockets.add({
            nodeId: 'n1',
            key: 'a',
            side: 'input',
            element: fakeSocketElement(10),
            position: { x: 0, y: 0 },
        });

        await watcher.recalcNode('other');

        expect(watcher.sockets.getPosition({ nodeId: 'n1', key: 'a', side: 'input' })).toEqual({ x: 0, y: 0 });
        expect(emit).not.toHaveBeenCalled();
    });
});
