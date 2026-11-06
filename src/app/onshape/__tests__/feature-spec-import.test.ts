/**
 * Mock-HTTP tests for the Standard Library feature-spec importer
 * (`scripts/feature-spec-import.mjs`) and the cache resolver
 * (`../feature-spec-cache.ts`). No credentials, no network.
 */
import { describe, expect, it } from 'vitest';

import {
  aggregateSpecs,
  buildAuthHeader,
  filterFeatureStudioElements,
  listFeatureStudioElements,
  loadQaConfig,
  makeOnshapeClient,
  parseDocumentUrl,
  parseEnvFile,
  resolveApiBase,
  runImport,
  serializeCache,
} from '../../../../scripts/feature-spec-import.mjs';

import { makeSpecResolver } from '../feature-spec-cache';
import { defaultCatalog } from '../catalog/spec-catalog';
import { buildPaletteInsertables, createNodeFromCatalogEntry } from '../../rete/catalog-node-factory';
import { CustomFeatureNode } from '../../rete/nodes/customfeaturenode';

/** A realistic raw BTFeatureSpec for chamfer (entities + radius + width). */
const CHAMFER_FIXTURE = {
  btType: 'BTFeatureSpec-129',
  featureType: 'chamfer',
  featureTypeName: 'Chamfer',
  namespace: 'e111111111111111111111111::m222222222222222222222222',
  parameters: [
    { btType: 'BTParameterSpecQuery-174', parameterId: 'entities', parameterName: 'Entities', defaultValue: { btType: 'BTMParameterQueryList-148', nodeId: '', queries: [] } },
    { btType: 'BTParameterSpecQuantity-173', parameterId: 'radius', parameterName: 'Radius', defaultValue: { btType: 'BTMParameterQuantity-147', value: 0.01, units: 'm' } },
    { btType: 'BTParameterSpecQuantity-173', parameterId: 'width', parameterName: 'Width', defaultValue: { btType: 'BTMParameterQuantity-147', value: 0.01, units: 'm' } },
  ],
} as never;

function fakeFetch(responses: Record<string, unknown>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const body = responses[url];
    return {
      ok: body !== undefined,
      status: body !== undefined ? 200 : 404,
      json: async () => body,
    } as Response;
  };
  return { fn: fn as typeof fetch, calls };
}

describe('parseDocumentUrl', () => {
  it('parses a workspace URL', () => {
    expect(parseDocumentUrl('https://cad.onshape.com/documents/did123/w/wid456/e/eid789')).toEqual({
      did: 'did123',
      wvm: 'w',
      wvmid: 'wid456',
    });
  });
  it('parses version and microversion URLs', () => {
    expect(parseDocumentUrl('https://cad.onshape.com/documents/did123/v/vid456')).toEqual({
      did: 'did123',
      wvm: 'v',
      wvmid: 'vid456',
    });
    expect(parseDocumentUrl('https://cad.onshape.com/documents/did123/m/mid456')).toEqual({
      did: 'did123',
      wvm: 'm',
      wvmid: 'mid456',
    });
  });
  it('accepts a bare document id with explicit workspace args', () => {
    expect(parseDocumentUrl('did123', { wvmid: 'wid456' })).toEqual({
      did: 'did123',
      wvm: 'w',
      wvmid: 'wid456',
    });
  });
  it('fails actionably for a bare id without workspace args', () => {
    expect(() => parseDocumentUrl('did123')).toThrow(/ONSHAPE_STD_WVMID/);
  });
  it('fails for empty/garbage input', () => {
    expect(() => parseDocumentUrl('')).toThrow(/ONSHAPE_STD_DOC_URL/);
    expect(() => parseDocumentUrl('not a url with spaces')).toThrow();
  });
});

describe('auth header construction', () => {
  it('builds Basic base64(accessKey:secretKey)', () => {
    expect(buildAuthHeader('ak', 'sk')).toBe(`Basic ${Buffer.from('ak:sk', 'utf8').toString('base64')}`);
  });
  it('sends the auth header on requests', async () => {
    const url = 'https://cad.onshape.com/api/v16/documents/d/d1/w/w1/elements';
    const { fn, calls } = fakeFetch({ [url]: [] });
    const client = makeOnshapeClient({ accessKey: 'ak', secretKey: 'sk', fetchImpl: fn });
    await client.getJson('/documents/d/d1/w/w1/elements');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(url);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(buildAuthHeader('ak', 'sk'));
  });
  it('fails with status only, never echoing credentials', async () => {
    const { fn } = fakeFetch({});
    const client = makeOnshapeClient({ accessKey: 'SECRET-KEY-VALUE', secretKey: 'SECRET-VALUE', fetchImpl: fn });
    await expect(client.getJson('/documents/d/d1/w/w1/elements')).rejects.toThrow(/HTTP 404/);
    await expect(client.getJson('/documents/d/d1/w/w1/elements')).rejects.not.toThrow(/SECRET/);
  });
});

describe('API version/base', () => {
  it('defaults to the versioned v16 API base', () => {
    expect(resolveApiBase({})).toBe('https://cad.onshape.com/api/v16');
  });
  it('honors a company-stack base and does not duplicate the version', () => {
    expect(resolveApiBase({ ONSHAPE_API_BASE: 'https://acme.onshape.com/api/' })).toBe('https://acme.onshape.com/api/v16');
    expect(resolveApiBase({ ONSHAPE_API_BASE: 'https://acme.onshape.com/api/v16' })).toBe('https://acme.onshape.com/api/v16');
    expect(resolveApiBase({ ONSHAPE_API_BASE: 'https://acme.onshape.com', ONSHAPE_API_VERSION: 'v11' })).toBe('https://acme.onshape.com/api/v11');
  });
});

describe('element filtering', () => {
  it('keeps only Feature Studio elements, sorted by id', () => {
    const elements = [
      { elementType: 'FEATURESTUDIO', id: 'e2', name: 'Two' },
      { elementType: 'PARTSTUDIO', id: 'e9', name: 'Part' },
      { elementType: 'featurestudio', id: 'e1', name: 'One' },
      { elementType: 'FEATURESTUDIO', name: 'No id' },
    ];
    expect(filterFeatureStudioElements(elements)).toEqual([
      { id: 'e1', name: 'One' },
      { id: 'e2', name: 'Two' },
    ]);
  });
  it('lists elements through the client', async () => {
    const url = 'https://cad.onshape.com/api/v16/documents/d/d1/w/w1/elements';
    const { fn } = fakeFetch({ [url]: [{ elementType: 'FEATURESTUDIO', id: 'e1' }] });
    const client = makeOnshapeClient({ accessKey: 'a', secretKey: 'b', fetchImpl: fn });
    expect(await listFeatureStudioElements(client, { did: 'd1', wvm: 'w', wvmid: 'w1' })).toEqual([
      { id: 'e1', name: '' },
    ]);
  });
});

describe('aggregation / dedup / ordering', () => {
  const chamfer = { featureType: 'chamfer', namespace: 'eAA::m1', parameters: [] };
  const extrude = { featureType: 'extrude', namespace: 'eBB::m2', parameters: [] };

  it('dedupes by featureType with first element (by eid) winning', () => {
    const result = aggregateSpecs([
      { eid: 'eBB', specs: [extrude] },
      { eid: 'eAA', specs: [chamfer, { featureType: 'chamfer', namespace: 'eXX::m9' }] },
    ]);
    expect(Object.keys(result)).toEqual(['chamfer', 'extrude']);
    expect(result.chamfer.eid).toBe('AA');
    expect(result.chamfer.microversion).toBe('1');
    expect(result.extrude.eid).toBe('BB');
  });
  it('is deterministic regardless of input order', () => {
    const a = aggregateSpecs([
      { eid: 'e2', specs: [extrude] },
      { eid: 'e1', specs: [chamfer] },
    ]);
    const b = aggregateSpecs([
      { eid: 'e1', specs: [chamfer] },
      { eid: 'e2', specs: [extrude] },
    ]);
    expect(serializeCache({ specs: a })).toBe(serializeCache({ specs: b }));
  });
  it('skips specs without a featureType', () => {
    expect(Object.keys(aggregateSpecs([{ eid: 'e1', specs: [{ parameters: [] }, null] }]))).toEqual([]);
  });
});

describe('missing config', () => {
  it('fails actionably naming the missing variables, without echoing values', () => {
    expect(() => loadQaConfig({})).toThrow(/ONSHAPE_ACCESS_KEY/);
    expect(() => loadQaConfig({ ONSHAPE_ACCESS_KEY: 'x' })).toThrow(/ONSHAPE_SECRET_KEY/);
    const err = (() => { try { loadQaConfig({}); } catch (e) { return String(e); } return ''; })();
    expect(err).toContain('fetch:feature-specs');
  });
  it('parses env files', () => {
    const env = parseEnvFile('# comment\nONSHAPE_ACCESS_KEY=ak\n\nONSHAPE_STD_DOC_URL="https://x/y"\n');
    expect(env).toEqual({ ONSHAPE_ACCESS_KEY: 'ak', ONSHAPE_STD_DOC_URL: 'https://x/y' });
  });
});

describe('end-to-end import with mock HTTP', () => {
  it('writes a deterministic cache keyed by featureType', async () => {
    const base = 'https://cad.onshape.com/api/v16';
    const { fn } = fakeFetch({
      [`${base}/documents/d/d1/w/w1/elements`]: [
        { elementType: 'FEATURESTUDIO', id: 'e2', name: 'Two' },
        { elementType: 'PARTSTUDIO', id: 'e9', name: 'Part' },
      ],
      [`${base}/featurestudios/d/d1/w/w1/e/e2/featurespecs`]: { featureSpecs: [CHAMFER_FIXTURE] },
    });
    const client = makeOnshapeClient({ accessKey: 'a', secretKey: 'b', fetchImpl: fn });
    let written = '';
    const cache = await runImport({
      config: { did: 'd1', wvm: 'w', wvmid: 'w1', sourceLabel: 'Test' },
      client,
      writeCacheFile: async (text) => { written = text; },
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(Object.keys(cache.specs)).toEqual(['chamfer']);
    expect(cache.specs.chamfer.eid).toBe('111111111111111111111111');
    expect(cache.specs.chamfer.microversion).toBe('222222222222222222222222');
    expect(cache.fetchedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(JSON.parse(written)).toEqual(cache);
    expect(written).not.toContain('a:b');
  });
  it('fails when no Feature Studio elements exist', async () => {
    const url = 'https://cad.onshape.com/api/v16/documents/d/d1/w/w1/elements';
    const { fn } = fakeFetch({ [url]: [{ elementType: 'PARTSTUDIO', id: 'e9' }] });
    const client = makeOnshapeClient({ accessKey: 'a', secretKey: 'b', fetchImpl: fn });
    await expect(runImport({
      config: { did: 'd1', wvm: 'w', wvmid: 'w1', sourceLabel: 'Test' },
      client,
      writeCacheFile: async () => {},
    })).rejects.toThrow(/No Feature Studio elements/);
  });
});

describe('palette metadata with cached real specs', () => {
  it('does not label a cached statement as a generic definition', () => {
    const items = buildPaletteInsertables(defaultCatalog.entries);
    const chamfer = items.find((item) => item.name === 'chamfer');
    expect(chamfer).toBeDefined();
    expect(chamfer?.meta).not.toContain('generic definition');
  });
});

describe('factory resolution with cached real specs', () => {
  const chamferEntry = defaultCatalog.entries.find((e) => e.name === 'chamfer');
  const fixtureCache = {
    version: 1,
    source: 'Test',
    sourceDid: 'd1',
    wvm: 'w',
    wvmid: 'w1',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    specs: {
      chamfer: {
        featureType: 'chamfer',
        eid: '111111111111111111111111',
        microversion: '222222222222222222222222',
        spec: CHAMFER_FIXTURE,
      },
    },
  };

  it('the catalog chamfer entry is generic by default', () => {
    expect(chamferEntry).toBeDefined();
    const node = createNodeFromCatalogEntry(chamferEntry!) as CustomFeatureNode;
    expect(node.genericDefinition).toBe(true);
  });
  it('the cache resolver supplies the real spec: entities + radius, no generic warning', () => {
    const resolveSpec = makeSpecResolver(fixtureCache as never);
    const node = createNodeFromCatalogEntry(chamferEntry!, resolveSpec) as CustomFeatureNode;
    expect(node).toBeInstanceOf(CustomFeatureNode);
    expect(node.genericDefinition).toBe(false);
    expect(node.inputs.entities).toBeDefined();
    expect(node.inputs.radius).toBeDefined();
    expect(node.getTitle()).toBe('Chamfer');
  });
  it('resolver refuses unknown types and eid mismatches', () => {
    const resolveSpec = makeSpecResolver(fixtureCache as never);
    expect(resolveSpec({ did: null, wvm: null, wvmid: null, eid: null, featureType: 'fillet', microversion: null })).toBeUndefined();
    expect(resolveSpec({ did: null, wvm: null, wvmid: null, eid: 'other', featureType: 'chamfer', microversion: null })).toBeUndefined();
    expect(resolveSpec({ did: null, wvm: null, wvmid: null, eid: '111111111111111111111111', featureType: 'chamfer', microversion: null })).toBe(CHAMFER_FIXTURE as never);
  });
  it('falls back to the generic synthesized spec when nothing is cached', () => {
    const resolveSpec = makeSpecResolver({ ...fixtureCache, specs: {} } as never);
    const node = createNodeFromCatalogEntry(chamferEntry!, resolveSpec) as CustomFeatureNode;
    expect(node.genericDefinition).toBe(true);
    expect(node.getTitle()).toBe('chamfer');
  });
});
