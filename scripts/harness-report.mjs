// harness-report.mjs — report-only inventory for the UI test harness (#75).
// Prints harness files, example-test count, and how to run the harness.
// Exits 0 always (report only); it never runs the tests itself.
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = [
  'src/app/test-utils/fake-onshape-api.ts',
  'src/app/test-utils/fake-messaging.ts',
  'src/app/test-utils/fixtures.ts',
  'src/app/test-utils/ui-helpers.ts',
  'src/app/test-utils/__tests__/harness.test.ts',
  'vitest.ui.config.ts',
  'src/app/dev/harness.html',
  'docs/ui-test-harness.md',
];

console.log('ui-harness report (issue #75)');
for (const rel of HARNESS) {
  console.log(`  ${existsSync(join(ROOT, rel)) ? 'OK  ' : 'MISS'} ${rel}`);
}
const dir = join(ROOT, 'src/app/test-utils/__tests__');
let testCount = 0;
if (existsSync(dir)) {
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.test.ts')) testCount += 1;
  }
}
console.log(`  harness test files: ${testCount} (run: pnpm run test:ui)`);
console.log('  note: pnpm dev serves /dev/harness.html without Onshape.');
