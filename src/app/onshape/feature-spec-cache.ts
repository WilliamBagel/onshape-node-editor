/**
 * Resolver over the committed Standard Library feature-spec cache
 * (`feature-specs.json`, written by `scripts/fetch-feature-specs.mjs`).
 *
 * The cache maps `featureType` to its raw `BTFeatureSpec` plus safe
 * provenance (element id, microversion, source label, fetch time). When a
 * cached spec exists it wins over the factory's generic synthesized spec,
 * so e.g. `chamfer` nodes expose their real `entities`/`radius` inputs
 * instead of a generic definition. When no cached spec exists the resolver
 * returns `undefined` and the caller falls back to the synthesized spec.
 */

import type { BTFeatureSpec129 } from 'onshape-typescript-fetch';
import type { FeatureSpecReference } from '../rete/serialization/graph-schema-types';

import cache from './feature-specs.json';

export interface CachedFeatureSpec {
  featureType: string;
  eid: string;
  microversion: string | null;
  spec: BTFeatureSpec129;
}

export interface FeatureSpecCache {
  version: number;
  source: string;
  sourceDid: string | null;
  wvm: string;
  wvmid: string | null;
  fetchedAt: string | null;
  specs: Record<string, CachedFeatureSpec>;
}

export const featureSpecCache = cache as unknown as FeatureSpecCache;

/**
 * Build a `SpecResolver` over a cache document (pure — tests pass a
 * fixture cache). Matches by `featureType`; when the reference carries an
 * `eid` (deserialized nodes) it must also match the cached element id.
 */
export function makeSpecResolver(cacheDoc: FeatureSpecCache): (ref: FeatureSpecReference) => BTFeatureSpec129 | undefined {
  return (ref) => {
    const cached = cacheDoc?.specs?.[ref.featureType];
    if (cached == null) return undefined;
    if (ref.eid != null && cached.eid != null && ref.eid !== cached.eid) return undefined;
    return cached.spec;
  };
}

/** Resolver over the committed cache, used by the node factory by default. */
export const cachedSpecResolver = makeSpecResolver(featureSpecCache);

/** Feature types present in the committed cache. */
export function cachedFeatureTypes(): string[] {
  return Object.keys(featureSpecCache.specs ?? {});
}
