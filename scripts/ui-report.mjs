#!/usr/bin/env node
/** Compat wrapper: markdown reporter lives in qa/harness/report.mjs (no HTML generation). */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = spawnSync(process.execPath, [path.join(root, 'qa/harness/report.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(res.status ?? 1);
