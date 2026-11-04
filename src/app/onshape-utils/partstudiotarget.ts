/**
 * Issue #2 (maintainer requirement): Run must target the single Part Studio
 * in the active document automatically, without asking the user to paste ids.
 *
 * The element-type string is `PARTSTUDIO` — the `GBTElementType.Partstudio`
 * value in onshape-typescript-fetch (`BTDocumentElementInfo.elementType`),
 * the same value already matched in `src/app/common/onshapeapi.ts` and in
 * the graph-identity tests. It mirrors `FEATURESTUDIO` in `graphidentity.ts`.
 *
 * Pure-ish: Onshape access is injected as the `documentApi` slice, so the
 * selection and the run-path decision are exercised by unit tests against
 * stubs. Persisting the unique target and logging live in `App`
 * (`resolveSinglePartStudioTarget()`), which wraps this module.
 */

import type { BTDocumentElementInfo } from 'onshape-typescript-fetch';
import type { PartStudioTarget } from './partstudiofeature';
import type { DocumentContext } from './graphidentity';

/** `GBTElementType.Partstudio` — the `elementType` of a Part Studio element. */
export const PART_STUDIO_ELEMENT_TYPE = 'PARTSTUDIO';

export interface PartStudioDocumentApi {
    getElementsInDocument(request: {
        did: string;
        wvm: string;
        wvmid: string;
    }): Promise<BTDocumentElementInfo[]>;
}

export type SinglePartStudioResult =
    | { status: 'unique'; target: PartStudioTarget; element: BTDocumentElementInfo }
    | { status: 'none'; count: 0 }
    | { status: 'ambiguous'; count: number; elements: BTDocumentElementInfo[] };

/**
 * Pick the single Part Studio out of a document's element list.
 *
 * Only `PARTSTUDIO` elements with a non-empty `id` are candidates (an element
 * without an id cannot be addressed by `addPartStudioFeature`). Exactly one
 * candidate is a usable target; zero or more than one is not, and the caller
 * falls back to the manual target prompt.
 */
export function selectSinglePartStudio(
    elements: readonly BTDocumentElementInfo[],
    context: DocumentContext,
): SinglePartStudioResult {
    const studios = elements.filter(
        (el) => el.elementType === PART_STUDIO_ELEMENT_TYPE && typeof el.id === 'string' && el.id.trim() !== '',
    );
    if (studios.length === 0) {
        return { status: 'none', count: 0 };
    }
    if (studios.length > 1) {
        return { status: 'ambiguous', count: studios.length, elements: studios };
    }
    const element = studios[0];
    return {
        status: 'unique',
        target: { did: context.did, wvm: 'w', wvmid: context.workspaceId, eid: element.id as string },
        element,
    };
}

/** List the active document's elements and select its single Part Studio. */
export async function resolveSinglePartStudio(
    documentApi: PartStudioDocumentApi,
    context: DocumentContext,
): Promise<SinglePartStudioResult> {
    const elements = await documentApi.getElementsInDocument({
        did: context.did,
        wvm: 'w',
        wvmid: context.workspaceId,
    });
    return selectSinglePartStudio(elements ?? [], context);
}

/**
 * Issue #74: a persisted target is never trusted blindly. It is usable only
 * when it names the *active* document, the *active* workspace, and an element
 * that is actually a Part Studio in that workspace's element list. A target
 * from another document, a version/microversion target (immutable — feature
 * insertion must target workspace `wvm: 'w'`), or a deleted/renamed element
 * is stale and must fall through to auto-resolution, never to insertion.
 */
export type PersistedTargetValidation =
    | { ok: true; target: PartStudioTarget }
    | { ok: false; reason: 'different-document' | 'context-mismatch' | 'element-missing' };

export function validatePersistedTarget(
    target: PartStudioTarget | undefined,
    elements: readonly BTDocumentElementInfo[],
    context: DocumentContext,
): PersistedTargetValidation {
    if (target == null) {
        return { ok: false, reason: 'context-mismatch' };
    }
    if (target.did !== context.did) {
        return { ok: false, reason: 'different-document' };
    }
    if (target.wvm !== 'w' || target.wvmid !== context.workspaceId) {
        return { ok: false, reason: 'context-mismatch' };
    }
    const present = elements.some(
        (el) => el.elementType === PART_STUDIO_ELEMENT_TYPE && el.id === target.eid,
    );
    if (!present) {
        return { ok: false, reason: 'element-missing' };
    }
    return { ok: true, target };
}

/** What `runRun()` should do about the Part Studio target. */
export type RunTargetAction = 'use-existing' | 'use-auto' | 'prompt';

/**
 * The run-path decision, pure: an already-configured target wins only when it
 * validates against the active document/element list (issue #74); a unique
 * auto-resolved target is used without prompting, and only zero or multiple
 * Part Studios fall back to the manual (in-app dialog) prompt.
 *
 * When `elements` and `context` are supplied the persisted target is
 * validated; a stale target behaves exactly like no target. When they are
 * omitted the legacy behaviour applies (existing wins unvalidated), kept for
 * callers that have no element list to check against.
 */
export function decideRunTargetAction(
    existing: PartStudioTarget | undefined,
    auto: SinglePartStudioResult | undefined,
    elements?: readonly BTDocumentElementInfo[],
    context?: DocumentContext,
): RunTargetAction {
    if (existing != null) {
        if (elements === undefined || context === undefined) return 'use-existing';
        if (validatePersistedTarget(existing, elements, context).ok) return 'use-existing';
        // Stale persisted target: fall through to auto-resolution/prompt.
    }
    if (auto?.status === 'unique') return 'use-auto';
    return 'prompt';
}

/** The target `Run` should insert into, resolved against a live element list. */
export type ResolvedRunTarget =
    | { status: 'use-existing'; target: PartStudioTarget }
    | { status: 'use-auto'; target: PartStudioTarget; element: BTDocumentElementInfo; staleExisting: boolean }
    | { status: 'prompt'; staleExisting: boolean; auto: SinglePartStudioResult };

/**
 * Resolve the run target with a single element-list fetch (issue #74): a
 * persisted target that still validates wins; a stale one is discarded and
 * the unique Part Studio in the active document/workspace is used; zero or
 * multiple Part Studios fall back to the picker (`prompt`).
 */
export async function resolveRunTarget(
    documentApi: PartStudioDocumentApi,
    context: DocumentContext,
    existing: PartStudioTarget | undefined,
): Promise<ResolvedRunTarget> {
    const elements = await documentApi.getElementsInDocument({
        did: context.did,
        wvm: 'w',
        wvmid: context.workspaceId,
    });
    const list = elements ?? [];
    const auto = selectSinglePartStudio(list, context);
    const staleExisting = existing != null && !validatePersistedTarget(existing, list, context).ok;
    const action = decideRunTargetAction(existing, auto, list, context);
    if (action === 'use-existing') {
        return { status: 'use-existing', target: existing as PartStudioTarget };
    }
    if (action === 'use-auto' && auto.status === 'unique') {
        return { status: 'use-auto', target: auto.target, element: auto.element, staleExisting };
    }
    return { status: 'prompt', staleExisting, auto };
}
