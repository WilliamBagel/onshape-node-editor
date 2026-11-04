#!/usr/bin/env node
/**
 * #7 — Generate `src/app/onshape/catalog/classification.json` from the scraped
 * library. Deterministic rules (first occurrence wins on name+descriptor,
 * matching the catalog loader's dedupe):
 *
 *   descriptor 'type'  -> 'type'
 *   descriptor 'enum'  -> 'enum'
 *   descriptor 'const' -> 'const'
 *   descriptor 'predicate' -> 'value'   (canBeX checks are pure expressions)
 *   descriptor '' with a Context parameter -> 'statement'
 *   descriptor '' with a signature or return type -> 'value'
 *   descriptor '' with neither -> 'not-node-able'
 *
 * `nodeable` is NOT decided here — that also needs the curated type map
 * (typemap.ts), which the loader applies at runtime. Hand-edit the generated
 * file for curated fixes; re-running this script overwrites them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const libraryPath = path.join(repoRoot, 'src/app/onshape/featurescript-library.json');
const outPath = path.join(repoRoot, 'src/app/onshape/catalog/classification.json');

const library = JSON.parse(readFileSync(libraryPath, 'utf8'));

const entries = {};
const counts = {};

for (const category of library.categories ?? []) {
    for (const file of category.files ?? []) {
        for (const raw of file.entries ?? []) {
            const descriptor = raw.descriptor ?? '';
            const key = `${raw.name}::${descriptor}`;
            if (key in entries) continue; // dedupe: first occurrence wins

            let kind;
            if (descriptor === 'type' || descriptor === 'enum' || descriptor === 'const') {
                kind = descriptor;
            } else if (descriptor === 'predicate') {
                kind = 'value';
            } else if (descriptor === '') {
                const params = raw.parameters ?? [];
                if (params.some((p) => p.type === 'Context')) {
                    kind = 'statement';
                } else if ((raw.signature ?? '') !== '' || (raw.returnType ?? '') !== '') {
                    kind = 'value';
                } else {
                    kind = 'not-node-able';
                }
            } else {
                kind = 'not-node-able';
            }

            entries[key] = kind;
            counts[kind] = (counts[kind] ?? 0) + 1;
        }
    }
}

const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
const document = {
    generated: 'scripts/catalog-classify.mjs — regenerate with `node scripts/catalog-classify.mjs`',
    ruleVersion: 1,
    entries: sorted,
};
writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${outPath}`);
console.log(`entries: ${Object.keys(entries).length}`);
for (const [kind, n] of Object.entries(counts).sort()) console.log(`  ${kind}: ${n}`);
