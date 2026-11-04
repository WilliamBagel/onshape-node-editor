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

/** What `runRun()` should do about the Part Studio target. */
export type RunTargetAction = 'use-existing' | 'use-auto' | 'prompt';

/**
 * The run-path decision, pure: an already-configured target wins, a unique
 * auto-resolved target is used without prompting, and only zero or multiple
 * Part Studios fall back to the manual (in-app dialog) prompt.
 */
export function decideRunTargetAction(
    existing: PartStudioTarget | undefined,
    auto: SinglePartStudioResult | undefined,
): RunTargetAction {
    if (existing != null) return 'use-existing';
    if (auto?.status === 'unique') return 'use-auto';
    return 'prompt';
}
