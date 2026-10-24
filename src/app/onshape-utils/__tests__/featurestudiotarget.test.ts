/**
 * Unit tests for the Feature Studio upload target (issue #1, criterion 1):
 * parsing, validation and persistence of `did` / `wvm` / `wvmid` / `eid`.
 */

import { describe, expect, it } from 'vitest';
import {
    FEATURE_STUDIO_TARGET_KEY,
    FeatureStudioTargetSettings,
    MemoryStorage,
    formatTarget,
    parseTargetString,
    validateTarget,
} from '../featurestudiotarget';

const GOOD = { did: 'did-1', wvm: 'w' as const, wvmid: 'ws-1', eid: 'eid-1' };

describe('validateTarget', () => {
    it('accepts a complete workspace target and trims pasted whitespace from ids', () => {
        const result = validateTarget({ did: ' did-1 ', wvm: 'w', wvmid: ' ws-1\n', eid: '\teid-1 ' });

        expect(result).toEqual({ ok: true, target: GOOD });
    });

    it('normalises the wvm segment case', () => {
        const result = validateTarget({ ...GOOD, wvm: 'V' as never });

        expect(result.ok).toBe(true);
        expect(result.ok === true && result.target.wvm).toBe('v');
    });

    it('rejects a missing target', () => {
        expect(validateTarget(undefined)).toEqual({ ok: false, error: 'No Feature Studio target is configured.' });
    });

    it('names every missing field', () => {
        const result = validateTarget({ did: 'did-1' });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toBe('Target is missing wvm, wvmid, eid.');
    });

    it('rejects a wvm segment that is not w, v or m', () => {
        const result = validateTarget({ ...GOOD, wvm: 'x' as never });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toContain('wvm must be one of w, v or m');
    });

    it('rejects whitespace-only ids', () => {
        const result = validateTarget({ ...GOOD, eid: '   ' });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toBe('Target is missing eid.');
    });
});

describe('parseTargetString', () => {
    it('parses the comma form and the ampersand form', () => {
        expect(parseTargetString('did=did-1,wvm=w,wvmid=ws-1,eid=eid-1')).toEqual({ ok: true, target: GOOD });
        expect(parseTargetString('did=did-1&wvm=w&wvmid=ws-1&eid=eid-1')).toEqual({ ok: true, target: GOOD });
    });

    it('ignores surrounding whitespace and newlines', () => {
        const parsed = parseTargetString('  did=did-1 ; wvm=w \n wvmid=ws-1 , eid=eid-1  ');

        expect(parsed).toEqual({ ok: true, target: GOOD });
    });

    it('round-trips through formatTarget', () => {
        const parsed = parseTargetString(formatTarget(GOOD));

        expect(parsed).toEqual({ ok: true, target: GOOD });
    });

    it('rejects an unknown field rather than silently ignoring it', () => {
        const parsed = parseTargetString('did=did-1,wvm=w,wvmid=ws-1,eid=eid-1,workspaceId=ws-1');

        expect(parsed.ok).toBe(false);
        expect(parsed.ok === false && parsed.error).toContain('Unknown target field "workspaceid"');
    });

    it('rejects a piece with no key=value separator', () => {
        const parsed = parseTargetString('did-1,wvm=w,wvmid=ws-1,eid=eid-1');

        expect(parsed.ok).toBe(false);
        expect(parsed.ok === false && parsed.error).toContain('is not a key=value pair');
    });

    it('rejects an empty string', () => {
        expect(parseTargetString('   ')).toEqual({ ok: false, error: 'Target string is empty.' });
    });

    it('reports the missing field when the prompt is submitted half-filled', () => {
        const parsed = parseTargetString('did=did-1,wvm=w,wvmid=ws-1,eid=');

        expect(parsed.ok).toBe(false);
        expect(parsed.ok === false && parsed.error).toBe('Target is missing eid.');
    });
});

describe('FeatureStudioTargetSettings', () => {
    it('persists a validated target and reads it back', () => {
        const storage = new MemoryStorage();
        const settings = new FeatureStudioTargetSettings(storage);

        expect(settings.get()).toBeUndefined();
        expect(settings.has()).toBe(false);

        settings.set({ ...GOOD, did: ' did-1 ' });

        expect(settings.get()).toEqual(GOOD);
        expect(settings.has()).toBe(true);
        // Stored as JSON under the documented key, not as an object reference.
        expect(JSON.parse(storage.getItem(FEATURE_STUDIO_TARGET_KEY) ?? 'null')).toEqual(GOOD);
    });

    it('persists across instances that share a storage', () => {
        const storage = new MemoryStorage();
        new FeatureStudioTargetSettings(storage).set(formatTarget(GOOD));

        expect(new FeatureStudioTargetSettings(storage).get()).toEqual(GOOD);
    });

    it('throws instead of storing an invalid target', () => {
        const settings = new FeatureStudioTargetSettings(new MemoryStorage());

        expect(() => settings.set('did=did-1,wvm=w,wvmid=ws-1')).toThrow('Target is missing eid.');
        expect(settings.get()).toBeUndefined();
    });

    it('treats a corrupt stored entry as unset instead of throwing', () => {
        const storage = new MemoryStorage();
        storage.setItem(FEATURE_STUDIO_TARGET_KEY, '{not json');
        expect(new FeatureStudioTargetSettings(storage).get()).toBeUndefined();

        storage.setItem(FEATURE_STUDIO_TARGET_KEY, JSON.stringify({ did: 'did-1' }));
        expect(new FeatureStudioTargetSettings(storage).get()).toBeUndefined();
    });

    it('clears the stored target', () => {
        const settings = new FeatureStudioTargetSettings(new MemoryStorage());
        settings.set(GOOD);

        settings.clear();

        expect(settings.get()).toBeUndefined();
        expect(settings.has()).toBe(false);
    });

    it('survives a storage whose read throws', () => {
        const exploding = {
            getItem() {
                throw new Error('SecurityError');
            },
            setItem() {},
            removeItem() {},
        };
        const settings = new FeatureStudioTargetSettings(exploding);

        expect(settings.get()).toBeUndefined();
    });
});
