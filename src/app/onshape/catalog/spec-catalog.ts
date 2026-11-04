/**
 * #7 — Loader/index over `featurescript-library.json`.
 *
 * Entries are deduplicated by name+descriptor (first occurrence wins —
 * overloads that share name and descriptor, e.g. the two `box3d` forms, are
 * collapsed to one entry; see the report for #7) and keyed by name and
 * category. Every entry gets a kind from the classification allowlist
 * (`classification.json`); anything absent from the allowlist defaults to
 * `not-node-able` rather than producing a broken node.
 *
 * `nodeable` is stricter than the kind: only `statement`/`value` entries
 * whose input and output ports all map to a known value type (see
 * `typemap.ts`) are node-able.
 */
import libraryJson from '../featurescript-library.json';
import classificationJson from './classification.json';
import { mapScrapedType } from './typemap';
import type { CatalogEntry, CatalogKind, CatalogPort } from './types';

interface RawParameter {
    name?: string;
    type?: string;
    description?: string;
}

interface RawEntry {
    name: string;
    descriptor?: string;
    signature?: string;
    returnType?: string;
    description?: string;
    parameters?: RawParameter[];
}

interface RawFile {
    fileName?: string;
    entries?: RawEntry[];
}

interface RawCategory {
    name: string;
    files?: RawFile[];
}

interface RawLibrary {
    categories?: RawCategory[];
}

interface RawClassification {
    entries?: Record<string, CatalogKind>;
}

export interface SpecCatalog {
    readonly entries: readonly CatalogEntry[];
    readonly categories: readonly string[];
    list(category: string): CatalogEntry[];
    search(term: string): CatalogEntry[];
    get(key: string): CatalogEntry | undefined;
}

export function entryKey(name: string, descriptor: string): string {
    return `${name}::${descriptor}`;
}

/**
 * Skip scraper artifacts that are not parameters: enum entries carry a
 * `Value` member typed `Description`, and a few entries carry prose where a
 * type belongs. Those are not ports.
 */
function isScraperArtifact(param: RawParameter): boolean {
    return param.type === 'Description';
}

export function buildCatalog(library: RawLibrary, classification: RawClassification): SpecCatalog {
    const kinds = classification.entries ?? {};
    const entries: CatalogEntry[] = [];
    const seen = new Set<string>();
    const enumNames = new Set<string>();
    const typeNames = new Set<string>();
    const categorySet = new Set<string>();

    // First pass: gather the enum/type names the typemap needs.
    for (const category of library.categories ?? []) {
        for (const file of category.files ?? []) {
            for (const raw of file.entries ?? []) {
                if (raw.descriptor === 'enum') enumNames.add(raw.name);
                if (raw.descriptor === 'type') typeNames.add(raw.name);
            }
        }
    }

    for (const category of library.categories ?? []) {
        categorySet.add(category.name);
        for (const file of category.files ?? []) {
            for (const raw of file.entries ?? []) {
                const descriptor = raw.descriptor ?? '';
                const key = entryKey(raw.name, descriptor);
                if (seen.has(key)) continue;
                seen.add(key);

                const kind: CatalogKind = kinds[key] ?? 'not-node-able';
                const nameSets = { enumNames, typeNames };
                const inputs: CatalogPort[] = (raw.parameters ?? [])
                    .filter((p) => !isScraperArtifact(p))
                    .map((p) => {
                        const scrapedType = p.type ?? '';
                        const mapped = mapScrapedType(scrapedType, nameSets);
                        return {
                            name: p.name ?? '',
                            valueType: mapped.valueType,
                            scrapedType,
                            enumName: mapped.enumName,
                            description: p.description ?? '',
                        };
                    });
                const returnType = raw.returnType ?? '';
                const outputs: CatalogPort[] =
                    returnType === ''
                        ? []
                        : [
                              {
                                  name: 'return',
                                  valueType: mapScrapedType(returnType, nameSets).valueType,
                                  scrapedType: returnType,
                                  description: '',
                              },
                          ];

                const typed =
                    inputs.every((p) => p.valueType !== 'Unknown') &&
                    outputs.every((p) => p.valueType !== 'Unknown');
                const nodeable = (kind === 'statement' || kind === 'value') && typed;

                entries.push({
                    key,
                    name: raw.name,
                    category: category.name,
                    file: file.fileName ?? '',
                    descriptor,
                    signature: raw.signature ?? '',
                    description: raw.description ?? '',
                    kind,
                    nodeable,
                    inputs,
                    outputs,
                });
            }
        }
    }

    const byCategory = new Map<string, CatalogEntry[]>();
    for (const entry of entries) {
        const list = byCategory.get(entry.category) ?? [];
        list.push(entry);
        byCategory.set(entry.category, list);
    }
    const byKey = new Map(entries.map((e) => [e.key, e]));

    return {
        entries,
        categories: [...categorySet],
        list: (category: string) => [...(byCategory.get(category) ?? [])],
        search: (term: string) => {
            const needle = term.trim().toLowerCase();
            if (needle === '') return [];
            return entries
                .filter(
                    (e) =>
                        e.name.toLowerCase().includes(needle) ||
                        e.description.toLowerCase().includes(needle),
                )
                .sort(
                    (a, b) =>
                        Number(b.nodeable) - Number(a.nodeable) || a.name.localeCompare(b.name),
                );
        },
        get: (key: string) => byKey.get(key),
    };
}

/** The catalog over the shipped library and classification. */
export const defaultCatalog: SpecCatalog = buildCatalog(
    libraryJson as RawLibrary,
    classificationJson as RawClassification,
);
