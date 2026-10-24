#!/usr/bin/env node
/**
 * The type-check gate for this repo.
 *
 * `pnpm run type-check` (vue-tsc --build over tsconfig.json -> the app, node and
 * server projects) is the raw, honest view, and it must report zero errors. This
 * script runs the same build with --force and parses the diagnostics, so CI can
 * fail on a count instead of a human reading the log.
 *
 * Every error counts, wherever it lives. That includes the installed dependency
 * `onshape-typescript-fetch`: it is a source-only git tarball (`main: "index.ts"`,
 * no .d.ts, 1481 generated model files), so `skipLibCheck` cannot cover it and its
 * .ts sources are compiled as part of this repo. The 25 errors that used to live
 * there are fixed in `patches/onshape-typescript-fetch@1.19.0.patch` (wired up
 * through `patchedDependencies` in pnpm-workspace.yaml). The node_modules counter
 * below is reported separately only to make a regression in that patch obvious
 * -- it no longer buys an exemption.
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
const dependency = [];
const compilerLevel = [];

for (const line of output.split('\n')) {
  const m = line.match(errorLine);
  if (m) {
    (m[1].startsWith('node_modules/') || m[1].includes('/node_modules/') ? dependency : owned).push(line);
    continue;
  }
  if (/^error TS\d+/.test(line.trim()) && !/^\s/.test(line)) compilerLevel.push(line.trim());
}

console.log('');
console.log('--- type-check gate ---');
console.log(`compiler exit status:       ${res.error ? `spawn failed: ${res.error.message}` : res.status}`);
console.log(`errors under src/**:        ${owned.length}`);
console.log(`errors in node_modules:     ${dependency.length}`);
console.log(`compiler-level errors:      ${compilerLevel.length}`);
for (const line of compilerLevel) console.log(`  ${line}`);

const total = owned.length + dependency.length + compilerLevel.length;
const failed =
  res.error !== undefined ||
  total > 0 ||
  (res.status !== 0 && total === 0);

if (failed) {
  console.log(`GATE FAILED: ${total} error(s)` +
    (res.error ? ` (the checker could not run: ${res.error.message})` : '') +
    (res.status !== 0 && total === 0
      ? ' (the checker exited non-zero and printed nothing parseable)'
      : '') + '.');
  process.exit(1);
}
console.log('GATE PASSED: no type errors.');
process.exit(0);
