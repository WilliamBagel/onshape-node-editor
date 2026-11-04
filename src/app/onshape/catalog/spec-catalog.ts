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
import { UTILITY_OVERRIDES, instanceOnPointsEntry } from './utility-overrides';
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
                // Standard-library statement path: `(context, id, definition
                // is map)` statements carry the definition as an untyped
                // generic map, which made `typed` false and hid the entry
                // (e.g. `chamfer`, `fillet`) from every search/palette that
                // builds from nodeable entries. Such an entry is still
                // node-able when every *other* port is typed: the factory
                // synthesizes a CustomFeatureNode from those ports and the
                // definition map is emitted explicitly as generic. Entries
                // with untyped definition children stay not-node-able.
                const TRIO = new Set(['context', 'id', 'definition']);
                const hasStdlibSignature =
                    inputs.some((p) => p.name === 'context' && p.valueType === 'Context') &&
                    inputs.some((p) => p.name === 'id' && p.valueType === 'Id') &&
                    inputs.some((p) => p.name === 'definition' && p.scrapedType === 'map');
                const genericDefinition =
                    kind === 'statement' &&
                    hasStdlibSignature &&
                    inputs
                        .filter((p) => !TRIO.has(p.name))
                        .every((p) => p.valueType !== 'Unknown') &&
                    outputs.every((p) => p.valueType !== 'Unknown');
                const nodeable = (kind === 'statement' || kind === 'value') && (typed || genericDefinition);

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
                    ...(genericDefinition ? { genericDefinition: true as const } : {}),
                    inputs,
                    outputs,
                });
            }
        }
    }

    // #11: curated utility ports replace the scraped ports for the
    // vector/matrix/transform family — the scrape collapsed overloads and
    // left scraper junk as types, which made them not node-able. Overrides
    // apply only to the real shipped library (identified by the presence of
    // the `opPattern` entry), never to small hand-built fixtures.
    // The instance-on-points node has no scraped entry (FeatureScript has
    // no geometry-nodes instancing), so it is registered synthetically for
    // the real library only.
    const isRealLibrary = seen.has('opPattern::');
    if (isRealLibrary) {
        for (const entry of entries) {
            const override = UTILITY_OVERRIDES[entry.key];
            if (override != null) {
                entry.inputs = override.inputs.map((p) => ({ ...p }));
                entry.outputs = override.outputs.map((p) => ({ ...p }));
                entry.kind = override.kind;
                entry.nodeable = true;
                entry.utilityId = override.utilityId;
            }
        }
        const synthetic = instanceOnPointsEntry();
        entries.push(synthetic);
        categorySet.add(synthetic.category);
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
