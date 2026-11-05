#!/usr/bin/env node
/** Compat wrapper: dashboard smoke lives in qa/dashboard/dashboard.smoke.mjs. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = spawnSync(process.execPath, [path.join(root, 'qa/dashboard/dashboard.smoke.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(res.status ?? 1);
