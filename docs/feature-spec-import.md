# Feature-spec import

Fetches real `BTFeatureSpec`s for the Onshape Standard Library into a
committed cache (`src/app/onshape/feature-specs.json`) so palette nodes
such as `chamfer` expose their true inputs (`entities`, `radius`, …)
instead of the generic synthesized definition. The node factory resolves
through the cache by default and falls back to the generic spec when a
feature type is not cached (`src/app/onshape/feature-spec-cache.ts`).

## Setup

1. Copy the template and fill in your credentials and the copied
   Standard Library document URL:

   ```sh
   cp .env.qa.example .env.qa.local
   # edit .env.qa.local, then:
   ```

   | Variable | Meaning |
   |---|---|
   | `ONSHAPE_ACCESS_KEY` | Onshape API access key |
   | `ONSHAPE_SECRET_KEY` | Onshape API secret key |
   | `ONSHAPE_STD_DOC_URL` | Copied Standard Library document URL, e.g. `https://cad.onshape.com/documents/<did>/w/<workspaceId>` |
   | `ONSHAPE_STD_WVM` | Optional workspace/version kind override (`w`, `v`, `m`) |
   | `ONSHAPE_STD_WVMID` | Optional workspace/version/microversion id (needed for bare document ids) |
   | `ONSHAPE_STD_SOURCE_LABEL` | Optional `source` label recorded in the cache |
   | `ONSHAPE_API_VERSION` | API version segment, default `v16` |
   | `ONSHAPE_API_BASE` | API base, default `https://cad.onshape.com/api`; set the company-stack host if the document lives there |

   `.env.qa.local` is gitignored. Never commit it; the importer never
   prints or writes credential values.

2. Run the import:

   ```sh
   pnpm run fetch:feature-specs
   ```

   Equivalent direct command: `node scripts/fetch-feature-specs.mjs`
   (a thin wrapper around `scripts/feature-spec-import.mjs`).

3. Commit the updated `src/app/onshape/feature-specs.json`.

## What it does

- Parses the document URL for `did` and workspace/version/microversion
  (`/w/…`, `/v/…`, `/m/…`); a bare document id works with
  `ONSHAPE_STD_WVMID`.
- Lists document elements via
  `GET /documents/d/{did}/{wvm}/{wvmid}/elements` and keeps the
  `FEATURESTUDIO` tabs.
- Fetches `getFeatureStudioSpecs` per element via
  `GET /featurestudios/d/{did}/{wvm}/{wvmid}/e/{eid}/featurespecs`
  (base `https://cad.onshape.com/api/v16` by default, configurable for
  company stacks; Basic `base64(accessKey:secretKey)` auth — paths verified against
  `node_modules/onshape-typescript-fetch/apis/`).
- Writes a deterministic cache keyed by `featureType` (element ids
  processed in ascending order, duplicate types resolved first-wins,
  keys sorted) with the raw spec plus safe metadata (`source`,
  `sourceDid`, `wvm`, `wvmid`, `fetchedAt`).

## Failure modes

- Missing `.env.qa.local` or variables: actionable error naming what to
  set (values are never echoed).
- Document URL without a workspace/version id and no `ONSHAPE_STD_WVMID`:
  error asking for one.
- No Feature Studio elements: error naming the document target.
- Non-2xx API responses: error with status, path and API origin. A 401 means the key is not valid on that stack; a 403 means the key authenticated but cannot see the document. Regenerate the key on the same stack as the document and check its permissions.

## Tests

Mock-HTTP unit tests (no credentials, no network):
`src/app/onshape/__tests__/feature-spec-import.test.ts` — URL parsing,
auth headers, element filtering, aggregation/dedup/ordering, missing
config, end-to-end import, and factory resolution with a chamfer fixture.
