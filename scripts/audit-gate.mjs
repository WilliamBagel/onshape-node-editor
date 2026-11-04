#!/usr/bin/env node
/**
 * Dependency audit gate (#46).
 *
 * Runs `pnpm audit --prod --json` and fails only on advisories that are NOT
 * listed in scripts/audit-allowlist.json. A new advisory therefore breaks CI
 * (and `pnpm run audit:gate`) until someone adds it to the allowlist with a
 * reason or fixes it with an override/bump.
 *
 * Usage: node scripts/audit-gate.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowlistPath = path.join(repoRoot, 'scripts', 'audit-allowlist.json');
const allowlist = new Set(
  JSON.parse(readFileSync(allowlistPath, 'utf8')).advisories.map((a) => String(a.id))
);

const res = spawnSync('pnpm', ['audit', '--prod', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

let advisories = {};
try {
  advisories = JSON.parse(res.stdout || '{}').advisories || {};
} catch {
  console.error('audit-gate: could not parse pnpm audit output:\n', (res.stdout || '').slice(0, 2000));
  process.exit(1);
}

const ids = Object.keys(advisories).map(String);
const unlisted = ids.filter((id) => !allowlist.has(id));
const stale = [...allowlist].filter((id) => !ids.includes(id));

console.log(`audit-gate: ${ids.length} advisories, ${allowlist.size} allowlisted, ${unlisted.length} unlisted`);
if (stale.length > 0) {
  console.log('audit-gate: stale allowlist entries (no longer reported, remove them):', stale.join(', '));
}
if (unlisted.length > 0) {
  console.error('audit-gate: UNLISTED advisories (add to scripts/audit-allowlist.json with a reason, or fix):');
  for (const id of unlisted) {
    const a = advisories[id] || {};
    console.error(`  - ${id} ${a.severity || ''} ${a.title || ''} (${a.vulnerable_versions || ''})`);
  }
  process.exit(1);
}
console.log('audit-gate: PASS (no new advisories).');
