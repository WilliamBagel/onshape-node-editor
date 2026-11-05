/**
 * Live socket positions: a DOMSocketPosition that stays correct across node
 * layout changes (defect: wires attach shifted down until the node is
 * dragged).
 *
 * Root cause: rete-render-utils' BaseSocketPosition snapshots socket centers
 * on 'rendered', but its 'noderesized' pipe only recomputes OUTPUT sockets.
 * INPUT socket positions therefore go stale whenever a node grows after
 * first paint (map/Definition section expanded, fonts applied late, controls
 * mounted async) — the wire endpoint keeps the pre-expansion offset, so it
 * sits too high/too low until a drag forces a re-render.
 *
 * Fix: subclass DOMSocketPosition and add a second pipe that recomputes
 * BOTH sides on 'noderesized', plus a double-rAF recalc after each node
 * 'rendered' (async controls/fonts settle after that event) and a full
 * recalc once document fonts are ready.
 *
 * Layout math is unchanged: offset is identity (as before), positions stay
 * relative to the node element, and 'nodetranslated' is still the base
 * class's emit-only fast path.
 */
import { BaseSchemes, Scope } from "rete";
import { DOMSocketPosition } from "rete-render-utils";

export class LiveDOMSocketPosition<Schemes extends BaseSchemes = BaseSchemes, K = unknown> extends DOMSocketPosition<
    Schemes,
    K
> {
    public attach(scope: Scope<never, [K]>): void {
        super.attach(scope);
        const area = this.area;
        if (area) {
            area.addPipe((context: any) => {
                if (context?.type === "noderesized") {
                    void this.recalcNode(context.data.id as string);
                } else if (context?.type === "rendered" && context.data?.type === "node") {
                    this.scheduleRecalc(context.data.id as string);
                }
                return context;
            });
        }
        if (typeof document !== "undefined" && document.fonts?.ready) {
            document.fonts.ready
                .then(() => this.recalcAll())
                .catch(() => undefined);
        }
    }

    private scheduleRecalc(nodeId: string): void {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => void this.recalcNode(nodeId));
            });
        } else {
            queueMicrotask(() => void this.recalcNode(nodeId));
        }
    }

    /**
     * Recompute the stored position of every socket on `nodeId` (inputs AND
     * outputs) from live DOM geometry and notify listeners. Same emit shape
     * the base class uses per socket: { nodeId, key, side }.
     */
    public async recalcNode(nodeId: string): Promise<void> {
        for (const item of [...this.sockets.snapshot()]) {
            if (item.nodeId !== nodeId) continue;
            item.position = await this.calculatePosition(nodeId, item.side, item.key, item.element);
            this.emitter.emit({ nodeId, key: item.key, side: item.side });
        }
    }

    /** Recompute every known socket (fonts-applied pass). */
    public async recalcAll(): Promise<void> {
        const nodeIds = new Set<string>();
        for (const item of this.sockets.snapshot()) {
            nodeIds.add(item.nodeId);
        }
        for (const nodeId of nodeIds) {
            await this.recalcNode(nodeId);
        }
    }
}
