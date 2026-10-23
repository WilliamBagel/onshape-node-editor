#!/usr/bin/env node
/**
 * The type-check gate for this repo.
 *
 * `pnpm run type-check` (vue-tsc --build over tsconfig.json -> the app, node and
 * server projects) is the raw, honest view. It reports ~25 errors that live
 * inside the installed dependency `onshape-typescript-fetch`, which cannot be
 * fixed from this repo: the package is a source-only git tarball
 * (`main: "index.ts"`, no .d.ts, 1481 generated model files), so `skipLibCheck`
 * cannot cover its .ts sources, and its generated models import their own
 * from-JSON helpers `from './'`. See tmp/HANDOFF.md for the enumeration and the
 * card that tracks patching it (or upstreaming the fix).
 *
 * This script implements the *documented* gate instead: an error anywhere under
 * src/** fails, an error inside node_modules/ is printed and exempted. It does
 * not mask new dependency errors silently -- every exempted line is echoed, and
 * a non-zero compiler exit with nothing parseable is itself a failure.
 *
 * Usage: node scripts/typecheck-gate.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vueTsc = path.join(repoRoot, 'node_modules', '.bin', 'vue-tsc');

// --force: in build mode a project that is already up to date reports nothing,
// so cached diagnostics would let a real error slip past the gate on the second
// run. Always recompute.
const res = spawnSync(vueTsc, ['--build', '--force'], {
  cwd: repoRoot,
  encoding: 'utf8',
  env: { ...process.env, FORCE_COLOR: '0' },
});

const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
if (output.trim() !== '') process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);

const errorLine = /^(\S+?)\((\d+),(\d+)\): error (TS\d+)/;
const owned = [];
const exempted = [];
const compilerLevel = [];

for (const line of output.split('\n')) {
  const m = line.match(errorLine);
  if (m) {
    (m[1].startsWith('node_modules/') || m[1].includes('/node_modules/') ? exempted : owned).push(line);
    continue;
  }
  if (/^error TS\d+/.test(line.trim()) && !/^\s/.test(line)) compilerLevel.push(line.trim());
}

console.log('');
console.log('--- type-check gate ---');
console.log(`compiler exit status:       ${res.error ? `spawn failed: ${res.error.message}` : res.status}`);
console.log(`errors under src/**:        ${owned.length}`);
console.log(`errors in node_modules:     ${exempted.length} (exempted: onshape-typescript-fetch)`);
console.log(`compiler-level errors:      ${compilerLevel.length}`);
for (const line of compilerLevel) console.log(`  ${line}`);
if (exempted.length > 0) {
  console.log('exempted lines (for the record):');
  for (const line of exempted) console.log(`  ${line}`);
}

const failed =
  res.error !== undefined ||
  owned.length > 0 ||
  compilerLevel.length > 0 ||
  (res.status !== 0 && owned.length + exempted.length + compilerLevel.length === 0);

if (failed) {
  console.log(`GATE FAILED: ${owned.length + compilerLevel.length} error(s) this repo owns` +
    (res.error ? ` (the checker could not run: ${res.error.message})` : '') +
    (res.status !== 0 && owned.length + exempted.length + compilerLevel.length === 0
      ? ' (the checker exited non-zero and printed nothing parseable)'
      : '') + '.');
  process.exit(1);
}
console.log('GATE PASSED: no type errors that this repo owns.');
process.exit(0);