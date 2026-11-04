/**
 * Issue #2 — single-Part-Studio auto-target.
 *
 * Pure selection (element list → unique / none / ambiguous), the async
 * resolution against a stub `documentApi`, and the run-path decision
 * (existing target wins, unique auto-target is used, otherwise prompt).
 */

import { describe, expect, it, vi } from 'vitest';
import type { BTDocumentElementInfo } from 'onshape-typescript-fetch';
import {
    PART_STUDIO_ELEMENT_TYPE,
    decideRunTargetAction,
    resolveRunTarget,
    resolveSinglePartStudio,
    selectSinglePartStudio,
    validatePersistedTarget,
} from '../partstudiotarget';

const CONTEXT = { did: 'did-0123456789abcdef', workspaceId: 'ws-0123456789abcdef' };

function element(id: string, elementType: BTDocumentElementInfo['elementType'], name = id): BTDocumentElementInfo {
    return { id, name, elementType };
}

describe('PART_STUDIO_ELEMENT_TYPE', () => {
    it('matches the onshape-typescript-fetch GBTElementType.Partstudio value', () => {
        expect(PART_STUDIO_ELEMENT_TYPE).toBe('PARTSTUDIO');
    });
});

describe('selectSinglePartStudio', () => {
    it('exactly one Part Studio: unique target in the active document/workspace', () => {
        const result = selectSinglePartStudio(
            [
                element('fs-1', 'FEATURESTUDIO', 'Studio'),
                element('ps-1', 'PARTSTUDIO', 'Part'),
                element('asm-1', 'ASSEMBLY', 'Assembly'),
            ],
            CONTEXT,
        );
        expect(result.status).toBe('unique');
        if (result.status !== 'unique') return;
        expect(result.target).toEqual({
            did: CONTEXT.did,
            wvm: 'w',
            wvmid: CONTEXT.workspaceId,
            eid: 'ps-1',
        });
        expect(result.element.id).toBe('ps-1');
    });

    it('no Part Studio: none, without prompting', () => {
        const result = selectSinglePartStudio([element('fs-1', 'FEATURESTUDIO')], CONTEXT);
        expect(result).toEqual({ status: 'none', count: 0 });
    });

    it('empty element list: none', () => {
        expect(selectSinglePartStudio([], CONTEXT)).toEqual({ status: 'none', count: 0 });
    });

    it('multiple Part Studios: ambiguous with the count', () => {
        const result = selectSinglePartStudio(
            [element('ps-1', 'PARTSTUDIO'), element('ps-2', 'PARTSTUDIO')],
            CONTEXT,
        );
        expect(result.status).toBe('ambiguous');
        if (result.status !== 'ambiguous') return;
        expect(result.count).toBe(2);
        expect(result.elements.map((el) => el.id)).toEqual(['ps-1', 'ps-2']);
    });

    it('a Part Studio element without an id cannot be addressed and is skipped', () => {
        const result = selectSinglePartStudio(
            [{ name: 'nameless', elementType: 'PARTSTUDIO' } as BTDocumentElementInfo, element('ps-1', 'PARTSTUDIO')],
            CONTEXT,
        );
        expect(result.status).toBe('unique');
        if (result.status !== 'unique') return;
        expect(result.target.eid).toBe('ps-1');
    });

    it('matching is by element type, never by name', () => {
        const result = selectSinglePartStudio(
            [element('fs-1', 'FEATURESTUDIO', 'Part'), element('ps-1', 'PARTSTUDIO', 'Something else')],
            CONTEXT,
        );
        expect(result.status).toBe('unique');
        if (result.status !== 'unique') return;
        expect(result.target.eid).toBe('ps-1');
    });
});

describe('resolveSinglePartStudio', () => {
    it('lists elements of the active document workspace and returns the unique target', async () => {
        const getElementsInDocument = vi.fn(async () => [
            element('ps-1', 'PARTSTUDIO', 'Part'),
        ]);
        const result = await resolveSinglePartStudio({ getElementsInDocument }, CONTEXT);
        expect(getElementsInDocument).toHaveBeenCalledWith({
            did: CONTEXT.did,
            wvm: 'w',
            wvmid: CONTEXT.workspaceId,
        });
        expect(result.status).toBe('unique');
        if (result.status !== 'unique') return;
        expect(result.target.eid).toBe('ps-1');
    });

    it('zero or multiple Part Studios resolve without a target', async () => {
        const none = await resolveSinglePartStudio(
            { getElementsInDocument: vi.fn(async () => [element('a-1', 'ASSEMBLY')]) },
            CONTEXT,
        );
        expect(none.status).toBe('none');

        const ambiguous = await resolveSinglePartStudio(
            {
                getElementsInDocument: vi.fn(async () => [
                    element('ps-1', 'PARTSTUDIO'),
                    element('ps-2', 'PARTSTUDIO'),
                ]),
            },
            CONTEXT,
        );
        expect(ambiguous.status).toBe('ambiguous');
    });
});

describe('decideRunTargetAction (run-path decision)', () => {
    const existing = { did: CONTEXT.did, wvm: 'w' as const, wvmid: CONTEXT.workspaceId, eid: 'ps-9' };
    const unique = selectSinglePartStudio([element('ps-1', 'PARTSTUDIO')], CONTEXT);
    const none = selectSinglePartStudio([], CONTEXT);
    const ambiguous = selectSinglePartStudio(
        [element('ps-1', 'PARTSTUDIO'), element('ps-2', 'PARTSTUDIO')],
        CONTEXT,
    );

    it('an existing target wins; auto-resolution is not consulted', () => {
        expect(decideRunTargetAction(existing, unique)).toBe('use-existing');
        expect(decideRunTargetAction(existing, undefined)).toBe('use-existing');
    });

    it('exactly one Part Studio: use it, never prompt for a raw id', () => {
        expect(decideRunTargetAction(undefined, unique)).toBe('use-auto');
    });

    it('zero or multiple Part Studios (or no auto result): fall back to the dialog prompt', () => {
        expect(decideRunTargetAction(undefined, none)).toBe('prompt');
        expect(decideRunTargetAction(undefined, ambiguous)).toBe('prompt');
        expect(decideRunTargetAction(undefined, undefined)).toBe('prompt');
    });
});

describe('validatePersistedTarget (issue #74)', () => {
    const live = [element('ps-1', 'PARTSTUDIO', 'Part'), element('fs-1', 'FEATURESTUDIO')];

    it('matching workspace context and a live Part Studio: valid', () => {
        expect(validatePersistedTarget({ did: CONTEXT.did, wvm: 'w', wvmid: CONTEXT.workspaceId, eid: 'ps-1' }, live, CONTEXT)).toEqual({
            ok: true,
            target: { did: CONTEXT.did, wvm: 'w', wvmid: CONTEXT.workspaceId, eid: 'ps-1' },
        });
    });

    it('a target from another document is stale (different-document)', () => {
        const result = validatePersistedTarget({ did: 'did-other', wvm: 'w', wvmid: CONTEXT.workspaceId, eid: 'ps-1' }, live, CONTEXT);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('different-document');
    });

    it('a stale target whose element is gone, or a version target, is stale', () => {
        expect(validatePersistedTarget({ did: CONTEXT.did, wvm: 'w', wvmid: CONTEXT.workspaceId, eid: 'ps-gone' }, live, CONTEXT).ok).toBe(false);
        const version = validatePersistedTarget({ did: CONTEXT.did, wvm: 'v', wvmid: 'ver-1', eid: 'ps-1' }, live, CONTEXT);
        expect(version.ok).toBe(false);
        if (!version.ok) expect(version.reason).toBe('context-mismatch');
        const wrongWs = validatePersistedTarget({ did: CONTEXT.did, wvm: 'w', wvmid: 'ws-other', eid: 'ps-1' }, live, CONTEXT);
        expect(wrongWs.ok).toBe(false);
        if (!wrongWs.ok) expect(wrongWs.reason).toBe('context-mismatch');
    });

    it('an eid that is not a Part Studio in the list is stale', () => {
        const result = validatePersistedTarget({ did: CONTEXT.did, wvm: 'w', wvmid: CONTEXT.workspaceId, eid: 'fs-1' }, live, CONTEXT);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('element-missing');
    });
});

describe('resolveRunTarget (mocked API, issue #74)', () => {
    const stale = { did: CONTEXT.did, wvm: 'w' as const, wvmid: CONTEXT.workspaceId, eid: 'ps-old' };

    it('unique open Part Studio with a stale stored target: uses the live one', async () => {
        const getElementsInDocument = vi.fn(async () => [element('ps-1', 'PARTSTUDIO', 'Part')]);
        const result = await resolveRunTarget({ getElementsInDocument }, CONTEXT, stale);
        expect(getElementsInDocument).toHaveBeenCalledWith({ did: CONTEXT.did, wvm: 'w', wvmid: CONTEXT.workspaceId });
        expect(result.status).toBe('use-auto');
        if (result.status !== 'use-auto') return;
        expect(result.target.eid).toBe('ps-1');
        expect(result.staleExisting).toBe(true);
    });

    it('stale target from another document never wins over the active document', async () => {
        const otherDoc = { did: 'did-other', wvm: 'w' as const, wvmid: CONTEXT.workspaceId, eid: 'ps-1' };
        const getElementsInDocument = vi.fn(async () => [element('ps-1', 'PARTSTUDIO', 'Part')]);
        const result = await resolveRunTarget({ getElementsInDocument }, CONTEXT, otherDoc);
        expect(result.status).toBe('use-auto');
        if (result.status !== 'use-auto') return;
        expect(result.target.did).toBe(CONTEXT.did);
        expect(result.staleExisting).toBe(true);
    });

    it('a valid persisted target in the matching workspace context is reused', async () => {
        const existing = { did: CONTEXT.did, wvm: 'w' as const, wvmid: CONTEXT.workspaceId, eid: 'ps-1' };
        const result = await resolveRunTarget(
            { getElementsInDocument: vi.fn(async () => [element('ps-1', 'PARTSTUDIO'), element('ps-2', 'PARTSTUDIO')]) },
            CONTEXT,
            existing,
        );
        expect(result.status).toBe('use-existing');
        if (result.status !== 'use-existing') return;
        expect(result.target.eid).toBe('ps-1');
    });

    it('zero Part Studios: falls back to the picker', async () => {
        const result = await resolveRunTarget(
            { getElementsInDocument: vi.fn(async () => [element('fs-1', 'FEATURESTUDIO')]) },
            CONTEXT,
            stale,
        );
        expect(result.status).toBe('prompt');
        if (result.status !== 'prompt') return;
        expect(result.staleExisting).toBe(true);
        expect(result.auto.status).toBe('none');
    });

    it('multiple Part Studios: falls back to the picker', async () => {
        const result = await resolveRunTarget(
            { getElementsInDocument: vi.fn(async () => [element('ps-1', 'PARTSTUDIO'), element('ps-2', 'PARTSTUDIO')]) },
            CONTEXT,
            undefined,
        );
        expect(result.status).toBe('prompt');
        if (result.status !== 'prompt') return;
        expect(result.auto.status).toBe('ambiguous');
    });

    it('decideRunTargetAction with validation: stale existing falls through to auto', () => {
        const live = [element('ps-1', 'PARTSTUDIO')];
        const auto = selectSinglePartStudio(live, CONTEXT);
        expect(decideRunTargetAction(stale, auto, live, CONTEXT)).toBe('use-auto');
        expect(decideRunTargetAction({ did: CONTEXT.did, wvm: 'w', wvmid: CONTEXT.workspaceId, eid: 'ps-1' }, auto, live, CONTEXT)).toBe('use-existing');
    });
});
