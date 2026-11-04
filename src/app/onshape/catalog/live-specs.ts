/**
 * #7 — Live-spec provider: `FeatureStudioApi.getFeatureStudioSpecs` per
 * Feature Studio element, cached, merged with the static catalog.
 *
 * The fetcher is injected (`SpecFetcher`) so tests never touch the network;
 * `specFetcherFromApi` adapts a real Onshape client (`api.featureStudioApi`)
 * with the same call `app.ts` already makes for graph loading. Nothing here
 * is wired into the app yet — that is #8.
 */
import type { BTFeatureSpec129 } from 'onshape-typescript-fetch';
import { mapBtType } from './typemap';
import type { CatalogEntry, ElementTarget, SpecFetcher } from './types';
import type { SpecCatalog } from './spec-catalog';

/** Structural slice of the Onshape client this provider needs. */
export interface FeatureStudioApi {
    getFeatureStudioSpecs(request: ElementTarget): Promise<{ featureSpecs?: BTFeatureSpec129[] }>;
}

export function specFetcherFromApi(api: { featureStudioApi: FeatureStudioApi }): SpecFetcher {
    return async (target) => {
        const response = await api.featureStudioApi.getFeatureStudioSpecs(target);
        return response?.featureSpecs ?? [];
    };
}

function elementKey(target: ElementTarget): string {
    return `${target.did}/${target.wvm}/${target.wvmid}/${target.eid}`;
}

interface RawLiveParameter {
    btType?: string;
    parameterId?: string;
    parameterName?: string;
    enumName?: string;
    enum?: { name?: string };
}

interface RawLiveSpec {
    featureType?: string;
    featureTypeName?: string;
    parameters?: RawLiveParameter[];
}

function liveSpecToEntry(spec: RawLiveSpec): CatalogEntry {
    const name = spec.featureType ?? spec.featureTypeName ?? 'unnamed';
    const inputs = (spec.parameters ?? []).map((p) => {
        const mapped = mapBtType(p.btType);
        return {
            name: p.parameterId ?? p.parameterName ?? '',
            valueType: mapped.valueType,
            scrapedType: p.btType ?? '',
            enumName: p.enumName ?? p.enum?.name,
            description: p.parameterName ?? '',
        };
    });
    return {
        key: `live::${name}`,
        name,
        category: 'live',
        file: '',
        descriptor: '',
        signature: '',
        description: spec.featureTypeName ?? '',
        kind: 'statement',
        nodeable: inputs.every((p) => p.valueType !== 'Unknown'),
        inputs,
        outputs: [],
    };
}

export class LiveSpecProvider {
    private readonly cache = new Map<string, Promise<CatalogEntry[]>>();

    constructor(
        private readonly fetcher: SpecFetcher,
        private readonly catalog?: SpecCatalog,
    ) {}

    /**
     * Live specs for one element as catalog entries, cached per element:
     * repeated calls for the same `did/wvm/wvmid/eid` fetch once.
     */
    specsFor(target: ElementTarget): Promise<CatalogEntry[]> {
        const key = elementKey(target);
        let pending = this.cache.get(key);
        if (pending === undefined) {
            pending = this.fetcher(target).then((specs) =>
                (specs as RawLiveSpec[]).map(liveSpecToEntry),
            );
            this.cache.set(key, pending);
        }
        return pending;
    }

    /**
     * Static catalog entries merged with the element's live specs. A live
     * spec whose feature type matches a static entry name enriches it (the
     * live typed ports win); unmatched live specs are appended.
     */
    async mergedEntries(target: ElementTarget): Promise<CatalogEntry[]> {
        const live = await this.specsFor(target);
        const staticEntries = this.catalog?.entries ?? [];
        const liveByName = new Map(live.map((e) => [e.name, e]));
        const merged = staticEntries.map((entry) => liveByName.get(entry.name) ?? entry);
        const staticNames = new Set(staticEntries.map((e) => e.name));
        for (const entry of live) {
            if (!staticNames.has(entry.name)) merged.push(entry);
        }
        return merged;
    }

    cacheSize(): number {
        return this.cache.size;
    }
}
