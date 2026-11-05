// scripts/feature-spec-import.mjs
//
// Configurable Onshape Standard Library feature-spec importer.
//
// Reads Onshape API credentials + a document URL from `.env.qa.local`
// (gitignored; see `.env.qa.example`), lists the Feature Studio elements in
// the document, fetches `getFeatureStudioSpecs` for each, and writes a
// deterministic committed cache to `src/app/onshape/feature-specs.json`
// keyed by `featureType`.
//
// Endpoints verified against the generated client
// (`node_modules/onshape-typescript-fetch/apis/`):
//   GET /documents/d/{did}/{wvm}/{wvmid}/elements          (DocumentApi.getElementsInDocument)
//   GET /featurestudios/d/{did}/{wvm}/{wvmid}/e/{eid}/featurespecs
//        (FeatureStudioApi.getFeatureStudioSpecs — path params, not query params)
// Auth: HTTP Basic base64(accessKey:secretKey), base https://cad.onshape.com/api.
//
// Secrets are never printed, logged, or written to the cache. All failure
// messages name the missing variable/file without echoing any value.
//
// This module is plain ESM JS with an injectable fetch so unit tests run
// with mock HTTP and no credentials (`src/app/onshape/__tests__/`).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ONSHAPE_API_BASE = 'https://cad.onshape.com/api';
export const QA_ENV_FILE = '.env.qa.local';
export const CACHE_RELATIVE_PATH = 'src/app/onshape/feature-specs.json';

export const REQUIRED_ENV = ['ONSHAPE_ACCESS_KEY', 'ONSHAPE_SECRET_KEY', 'ONSHAPE_STD_DOC_URL'];

/**
 * Parse `KEY=VALUE` lines from a dotenv-style file. Blank lines and `#`
 * comments are skipped; surrounding quotes on values are stripped. Values
 * are never logged by this function.
 */
export function parseEnvFile(text) {
  const env = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/**
 * Validate the QA env and build the importer config. Throws an actionable
 * error naming what is missing; never echoes a value.
 */
export function loadQaConfig(env) {
  const missing = REQUIRED_ENV.filter((name) => env[name] == null || String(env[name]).trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Missing required config: ${missing.join(', ')}. ` +
        `Copy .env.qa.example to ${QA_ENV_FILE} and fill in your Onshape API access key, secret key, and the copied Standard Library document URL. ` +
        `Run: pnpm run fetch:feature-specs`,
    );
  }
  const target = parseDocumentUrl(String(env.ONSHAPE_STD_DOC_URL).trim(), {
    wvm: env.ONSHAPE_STD_WVM?.trim() || undefined,
    wvmid: env.ONSHAPE_STD_WVMID?.trim() || undefined,
  });
  return {
    accessKey: String(env.ONSHAPE_ACCESS_KEY).trim(),
    secretKey: String(env.ONSHAPE_SECRET_KEY).trim(),
    sourceLabel: env.ONSHAPE_STD_SOURCE_LABEL?.trim() || 'Onshape Standard Library (copied document)',
    ...target,
  };
}

/**
 * Parse an Onshape document URL into `{ did, wvm, wvmid }`.
 *
 * Accepts full URLs such as
 *   https://cad.onshape.com/documents/<did>/w/<workspaceId>/e/<elementId>
 *   https://cad.onshape.com/documents/<did>/v/<versionId>/...
 *   https://cad.onshape.com/documents/<did>/m/<microversionId>/...
 * and a bare document id (then `wvm`/`wvmid` must come from options).
 * `wvm` defaults to `'w'`. Throws when the id cannot be determined or a
 * bare id is given without a workspace/version id.
 */
export function parseDocumentUrl(input, options = {}) {
  const raw = String(input ?? '').trim();
  if (raw === '') {
    throw new Error(
      'Empty document URL. Set ONSHAPE_STD_DOC_URL to the copied Standard Library document URL (see docs/feature-spec-import.md).',
    );
  }

  let did;
  let wvm;
  let wvmid;

  // Website URLs are /documents/<did>/... while API paths are
  // /documents/d/<did>/... — accept both.
  const docMatch = /\/documents\/(?:d\/)?([^/]+)/.exec(raw);
  if (docMatch) {
    did = docMatch[1];
    const wvmMatch = /\/(w|v|m)\/([^/]+)/.exec(raw.slice(docMatch.index + docMatch[0].length));
    if (wvmMatch) {
      wvm = wvmMatch[1];
      wvmid = wvmMatch[2];
    }
  } else if (!raw.includes('/') && !raw.includes(' ')) {
    did = raw;
  }

  if (did == null || did === '') {
    throw new Error(
      'Could not parse a document id from ONSHAPE_STD_DOC_URL. Expected an Onshape document URL like https://cad.onshape.com/documents/<did>/w/<workspaceId> or a bare document id.',
    );
  }

  wvm = options.wvm ?? wvm ?? 'w';
  wvmid = options.wvmid ?? wvmid;
  if (wvmid == null || wvmid === '') {
    throw new Error(
      'Document URL has no workspace/version/microversion. Either use a URL that includes /w/<id>, /v/<id> or /m/<id>, or set ONSHAPE_STD_WVMID (and optionally ONSHAPE_STD_WVM).',
    );
  }
  if (!['w', 'v', 'm'].includes(wvm)) {
    throw new Error(`Invalid workspace/version kind "${wvm}". Expected "w", "v" or "m".`);
  }
  return { did, wvm, wvmid };
}

/** HTTP Basic auth header for Onshape API keys. Never log the result. */
export function buildAuthHeader(accessKey, secretKey) {
  return `Basic ${Buffer.from(`${accessKey}:${secretKey}`, 'utf8').toString('base64')}`;
}

/** Absolute URL for an API path (paths in this module start with `/`). */
export function apiUrl(basePath, path) {
  return `${String(basePath).replace(/\/+$/, '')}${path}`;
}

/**
 * Minimal authenticated GET client over an injectable fetch. Errors carry
 * the HTTP status and path only — never headers, keys, or response secrets.
 */
export function makeOnshapeClient({ accessKey, secretKey, basePath = ONSHAPE_API_BASE, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation available. Run on Node 20+ or pass fetchImpl.');
  }
  const authorization = buildAuthHeader(accessKey, secretKey);
  return {
    async getJson(path) {
      const res = await fetchImpl(apiUrl(basePath, path), {
        method: 'GET',
        headers: { Authorization: authorization, Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Onshape API request failed: GET ${path} -> HTTP ${res.status}. Check the document URL, workspace/version ids, and that the API key has access to the document.`);
      }
      return res.json();
    },
  };
}

/** Keep only Feature Studio elements, sorted deterministically by id. */
export function filterFeatureStudioElements(elements) {
  return (elements ?? [])
    .filter((el) => String(el?.elementType ?? '').toUpperCase() === 'FEATURESTUDIO')
    .filter((el) => el?.id != null && String(el.id) !== '')
    .map((el) => ({ id: String(el.id), name: el.name ?? '' }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** List Feature Studio elements for a document target. */
export async function listFeatureStudioElements(client, target) {
  const elements = await client.getJson(
    `/documents/d/${encodeURIComponent(target.did)}/${encodeURIComponent(target.wvm)}/${encodeURIComponent(target.wvmid)}/elements`,
  );
  return filterFeatureStudioElements(elements);
}

/** Fetch the raw feature specs for one Feature Studio element. */
export async function fetchSpecsForElement(client, target, eid) {
  const res = await client.getJson(
    `/featurestudios/d/${encodeURIComponent(target.did)}/${encodeURIComponent(target.wvm)}/${encodeURIComponent(target.wvmid)}/e/${encodeURIComponent(eid)}/featurespecs`,
  );
  return res?.featureSpecs ?? [];
}

/** Parse `e<eid>::m<microversion>` namespaces; returns nulls when absent. */
export function parseSpecNamespace(spec) {
  const namespace = typeof spec?.namespace === 'string' ? spec.namespace : '';
  const match = /^e([^:]+)::m([^:]+)$/.exec(namespace);
  return { eid: match?.[1] ?? null, microversion: match?.[2] ?? null };
}

/**
 * Aggregate per-element spec lists into a map keyed by `featureType`.
 * Elements are processed in ascending `eid` order so duplicates resolve
 * deterministically (first element wins). Specs without a `featureType`
 * are skipped. Returns a plain object with keys sorted ascending.
 */
export function aggregateSpecs(perElement) {
  const sorted = [...(perElement ?? [])].sort((a, b) => String(a.eid).localeCompare(String(b.eid)));
  const byType = new Map();
  for (const { eid, specs } of sorted) {
    for (const spec of specs ?? []) {
      const featureType = spec?.featureType;
      if (featureType == null || String(featureType) === '' || byType.has(featureType)) continue;
      const parsed = parseSpecNamespace(spec);
      byType.set(String(featureType), {
        featureType: String(featureType),
        eid: parsed.eid ?? String(eid),
        microversion: parsed.microversion,
        spec,
      });
    }
  }
  const out = {};
  for (const key of [...byType.keys()].sort()) out[key] = byType.get(key);
  return out;
}

/**
 * Build the committed cache document. Safe metadata only: source label,
 * document/workspace ids, fetch timestamp, and the raw specs. No credentials.
 */
export function buildCache({ sourceLabel, did, wvm, wvmid, fetchedAt, specs }) {
  return {
    version: 1,
    source: sourceLabel,
    sourceDid: did,
    wvm,
    wvmid,
    fetchedAt,
    specs,
  };
}

/** Serialize the cache deterministically (sorted keys already; 2-space indent). */
export function serializeCache(cache) {
  return `${JSON.stringify(cache, null, 2)}\n`;
}

/**
 * Full import run with injectable I/O (tests pass mocks; the CLI passes
 * real fs/fetch). Returns the cache object written.
 */
export async function runImport({ config, client, writeCacheFile, now = () => new Date() }) {
  const elements = await listFeatureStudioElements(client, config);
  if (elements.length === 0) {
    throw new Error(
      `No Feature Studio elements found in document ${config.did} (${config.wvm}/${config.wvmid}). ` +
        'Check the document URL — the copied Standard Library document must contain Feature Studio tabs.',
    );
  }
  const perElement = [];
  for (const el of elements) {
    const specs = await fetchSpecsForElement(client, config, el.id);
    perElement.push({ eid: el.id, specs });
  }
  const cache = buildCache({
    sourceLabel: config.sourceLabel,
    did: config.did,
    wvm: config.wvm,
    wvmid: config.wvmid,
    fetchedAt: now().toISOString(),
    specs: aggregateSpecs(perElement),
  });
  await writeCacheFile(serializeCache(cache));
  return cache;
}

/** CLI entry point. */
export async function main(argv = process.argv.slice(2), io = {}) {
  const root = io.root ?? dirname(dirname(fileURLToPath(import.meta.url)));
  const envPath = join(root, QA_ENV_FILE);
  let envText;
  try {
    envText = readFileSync(envPath, 'utf8');
  } catch {
    throw new Error(
      `Missing ${QA_ENV_FILE}. Copy .env.qa.example to ${QA_ENV_FILE} and fill in your Onshape API access key, secret key, and the copied Standard Library document URL. See docs/feature-spec-import.md.`,
    );
  }
  const config = loadQaConfig(parseEnvFile(envText));
  const client = makeOnshapeClient({ accessKey: config.accessKey, secretKey: config.secretKey });
  const outPath = join(root, CACHE_RELATIVE_PATH);
  const cache = await runImport({
    config,
    client,
    writeCacheFile: async (text) => writeFileSync(outPath, text, 'utf8'),
  });
  const count = Object.keys(cache.specs).length;
  process.stdout.write(`Wrote ${count} feature spec(s) to ${CACHE_RELATIVE_PATH} (source: ${cache.source}).\n`);
  return cache;
}

const isMain = process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`${err?.message ?? err}\n`);
    process.exitCode = 1;
  });
}
