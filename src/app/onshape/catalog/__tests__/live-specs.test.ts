import { describe, expect, it, vi } from 'vitest';
import { LiveSpecProvider } from '../live-specs';
import { defaultCatalog } from '../spec-catalog';
import type { ElementTarget } from '../types';

const TARGET: ElementTarget = { did: 'd1', wvm: 'w', wvmid: 'w1', eid: 'e1' };

const CHAMFER_SPEC = {
    btType: 'BTFeatureSpec-129',
    featureType: 'chamfer',
    featureTypeName: 'Chamfer',
    parameters: [
        { btType: 'BTParameterSpecQuery-174', parameterId: 'entities', parameterName: 'Entities' },
        { btType: 'BTParameterSpecQuantity-173', parameterId: 'width', parameterName: 'Width' },
        { btType: 'BTParameterSpecBoolean-170', parameterId: 'flipDirection' },
        {
            btType: 'BTParameterSpecEnum-171',
            parameterId: 'mode',
            enumName: 'ChamferMode',
        },
        { btType: 'BTParameterSpecSomethingNew-9999', parameterId: 'future' },
    ],
};

describe('live spec provider (#7)', () => {
    it('fetches once per element and caches the result', async () => {
        const fetcher = vi.fn(async () => [CHAMFER_SPEC]);
        const provider = new LiveSpecProvider(fetcher);

        const first = await provider.specsFor(TARGET);
        const second = await provider.specsFor(TARGET);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith(TARGET);
        expect(second).toBe(first);
        expect(provider.cacheSize()).toBe(1);

        await provider.specsFor({ ...TARGET, eid: 'e2' });
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(provider.cacheSize()).toBe(2);
    });

    it('turns live BTParameterSpec types into typed ports', async () => {
        const provider = new LiveSpecProvider(async () => [CHAMFER_SPEC]);
        const [chamfer] = await provider.specsFor(TARGET);
        expect(chamfer?.name).toBe('chamfer');
        expect(chamfer?.kind).toBe('statement');
        expect(chamfer?.inputs).toEqual([
            expect.objectContaining({ name: 'entities', valueType: 'QueryList' }),
            expect.objectContaining({ name: 'width', valueType: 'ValueWithUnits' }),
            expect.objectContaining({ name: 'flipDirection', valueType: 'Boolean' }),
            expect.objectContaining({ name: 'mode', valueType: 'Enum', enumName: 'ChamferMode' }),
            // A future spec type we do not know yet is Unknown, not a guess.
            expect.objectContaining({ name: 'future', valueType: 'Unknown' }),
        ]);
        // Unknown port -> the live feature is not node-able yet.
        expect(chamfer?.nodeable).toBe(false);
    });

    it('a fully-typed live feature is node-able', async () => {
        const provider = new LiveSpecProvider(async () => [
            {
                featureType: 'extrude',
                parameters: [
                    { btType: 'BTParameterSpecBoolean-170', parameterId: 'flip' },
                    { btType: 'BTParameterSpecQuantity-173', parameterId: 'depth' },
                ],
            },
        ]);
        const [extrude] = await provider.specsFor(TARGET);
        expect(extrude?.nodeable).toBe(true);
        expect(extrude?.inputs.every((p) => p.valueType !== 'Unknown')).toBe(true);
    });

    it('mergedEntries combines the static catalog with live specs', async () => {
        const provider = new LiveSpecProvider(async () => [CHAMFER_SPEC], defaultCatalog);
        const merged = await provider.mergedEntries(TARGET);
        // Static entries survive; the live chamfer (no static namesake) is added.
        expect(merged.some((e) => e.name === 'cross')).toBe(true);
        const live = merged.find((e) => e.key === 'live::chamfer');
        expect(live?.inputs[0]?.valueType).toBe('QueryList');
        expect(live?.category).toBe('live');
    });
});
