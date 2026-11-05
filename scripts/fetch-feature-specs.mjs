// scripts/fetch-feature-specs.mjs — CLI entry point for the feature-spec
// importer. All logic lives in ./feature-spec-import.mjs (importable by
// tests); this file exists so `pnpm run fetch:feature-specs` has a stable
// name. See docs/feature-spec-import.md.
export * from './feature-spec-import.mjs';

import { main } from './feature-spec-import.mjs';

main().catch((err) => {
  process.stderr.write(`${err?.message ?? err}\n`);
  process.exitCode = 1;
});
