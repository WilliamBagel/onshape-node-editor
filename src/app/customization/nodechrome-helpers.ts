import { OnshapeFeatureSpecInput } from '../rete/inputoutput/onshapefeaturespecinput.js';
import type { OnshapeInput as OnshapeInputClass } from '../rete/inputoutput/onshapeinput.js';
import type { OnshapeOutput as OnshapeOutputClass } from '../rete/inputoutput/onshapeoutput.js';

/**
 * Pure decisions for node chrome (OnshapeNode / OnshapeInputMap), kept out of
 * the components so the regressions fixed for issue #72 are testable without
 * a DOM (vitest runs in a node environment).
 */

export interface ParamEntry {
    key: string;
    input: OnshapeInputClass<any>;
}

/**
 * Entries to render for a map input: `paramInputs` filtered by the map's own
 * `hiddenParameters`. A missing `paramInputs` renders nothing, and each
 * (possibly nested) map filters by its own hidden set, not its parent's.
 */
export function visibleParamEntries(
    paramInputs: { [parameterId: string]: OnshapeInputClass<any> } | null | undefined,
    hiddenParameters: { [parameterId: string]: boolean } | null | undefined,
): ParamEntry[] {
    if (paramInputs == null) {
        return [];
    }
    return Object.entries(paramInputs)
        .filter(([key]) => hiddenParameters?.[key] !== true)
        .map(([key, input]) => ({ key, input }));
}

/**
 * True when an entry must render as a recursive map (header + children)
 * instead of a leaf row: it carries child inputs (`paramInputs`) or is
 * itself typed as a map.
 */
export function isNestedMapInput(input: unknown): boolean {
    if (input == null) {
        return false;
    }
    if (input instanceof OnshapeFeatureSpecInput) {
        return true;
    }
    const candidate = input as { paramInputs?: unknown; type?: unknown };
    return candidate.paramInputs != null || candidate.type === 'map';
}

/** Expanded state read from the reactive source (`input.expanded`). */
export function expandedFromInput(input: unknown): boolean {
    const expanded = (input as { expanded?: boolean } | null | undefined)?.expanded;
    return typeof expanded === 'boolean' ? expanded : true;
}

/** Distance (px) within which a press on the node title counts as a click. */
export const TITLE_CLICK_MAX_DRAG_PX = 5;

/**
 * A press (pointerdown) followed by a click (pointerup) at most
 * {@link TITLE_CLICK_MAX_DRAG_PX}px away starts title editing; further away
 * was a node drag, so the title stays put.
 */
export function shouldStartTitleEdit(
    downX: number | null,
    downY: number | null,
    upX: number,
    upY: number,
): boolean {
    if (downX == null || downY == null) {
        return true;
    }
    const dx = upX - downX;
    const dy = upY - downY;
    return dx * dx + dy * dy <= TITLE_CLICK_MAX_DRAG_PX * TITLE_CLICK_MAX_DRAG_PX;
}

export type TitleEditAction = 'commit' | 'cancel';

/** Enter commits the rename, Escape cancels it; anything else is ignored. */
export function titleEditActionForKey(key: string): TitleEditAction | null {
    if (key === 'Enter') {
        return 'commit';
    }
    if (key === 'Escape') {
        return 'cancel';
    }
    return null;
}

/**
 * Title after a commit: the draft, unless it is blank, in which case the
 * original title is kept (a node never ends up unnamed).
 */
export function commitTitleEdit(original: string, draft: string): string {
    return draft.trim() === '' ? original : draft;
}

/** Collapsed state after toggling the header affordance. */
export function nextCollapsed(collapsed: boolean): boolean {
    return !collapsed;
}

/**
 * Default maximum socket rows on a collapsed node: 3. A collapsed card grows
 * horizontally instead of vertically, so a Chamfer's 7 sockets form three
 * columns of 3/3/1 rather than one long column. Inputs fill
 * top-to-bottom and overflow rightwards; outputs fill top-to-bottom and
 * overflow leftwards (each new column starts at its top row).
 */
export const COLLAPSED_SOCKET_MAX_ROWS = 3;

/**
 * Rows a collapsed socket group actually needs: one to the configured limit,
 * never zero (a `repeat(0, …)` grid template is invalid CSS) and never more
 * than the sockets present, so a one-socket group stays one 14px row.
 */
export function collapsedSocketRows(count: number, maxRows = COLLAPSED_SOCKET_MAX_ROWS): number {
    const limit = Number.isFinite(maxRows) ? Math.max(1, Math.floor(maxRows)) : COLLAPSED_SOCKET_MAX_ROWS;
    const n = Number.isFinite(count) ? Math.floor(count) : 0;
    return Math.max(1, Math.min(n, limit));
}

/**
 * One socket to render on a collapsed node: exactly the same shape the
 * expanded `Ref` sockets carry (`side/key/btType/nodeId/payload`), so the
 * collapsed card keeps every connection point.
 */
export interface CollapsedSocket {
    side: 'input' | 'output';
    key: string;
    btType: string;
    nodeId: string;
    payload: OnshapeInputClass<any>;
}

/**
 * Flatten the visible entries to the leaf sockets the expanded rows expose:
 * top-level leaves directly, nested-map children recursively (each level
 * through its own `visibleParamEntries`, so hidden children stay hidden).
 * A `seen` set refuses a second registration of the same `side:key`, so the
 * collapsed strip can never mount a duplicate usable socket.
 */
export function collectCollapsedSockets(
    entries: ParamEntry[],
    nodeId: string,
): CollapsedSocket[] {
    const out: CollapsedSocket[] = [];
    const seen = new Set<string>();
    const push = (socket: CollapsedSocket): void => {
        if (socket.key === '') return;
        const id = `${socket.side}:${socket.key}`;
        if (seen.has(id)) return;
        seen.add(id);
        out.push(socket);
    };
    const visit = (list: ParamEntry[]): void => {
        for (const { key, input } of list) {
            if (isNestedMapInput(input)) {
                const map = input as OnshapeFeatureSpecInput;
                visit(visibleParamEntries(map.paramInputs, map.hiddenParameters));
            } else {
                push({ side: 'input', key, btType: (input as { type?: string })?.type ?? '', nodeId, payload: input });
            }
        }
    };
    visit(entries);
    return out;
}

/** Output sockets for the collapsed strip (all outputs, de-duplicated). */
export function collectCollapsedOutputSockets(
    outputs: Record<string, OnshapeOutputClass> | null | undefined,
    nodeId: string,
): CollapsedSocket[] {
    if (outputs == null) return [];
    const seen = new Set<string>();
    return Object.entries(outputs)
        .filter(([key]) => {
            const id = `output:${key}`;
            if (key === '' || seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .map(([key, output]) => ({
            side: 'output' as const,
            key,
            btType: (output as { type?: string })?.type ?? '',
            nodeId,
            payload: output as unknown as OnshapeInputClass<any>,
        }));
}
