import { OnshapeFeatureSpecInput } from '../rete/inputoutput/onshapefeaturespecinput.js';
import type { OnshapeInput as OnshapeInputClass } from '../rete/inputoutput/onshapeinput.js';

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
