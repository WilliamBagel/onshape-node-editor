import { describe, expect, it } from 'vitest';
import { buildCatalog, defaultCatalog } from '../spec-catalog';
import { mapScrapedType } from '../typemap';
import type { CatalogKind } from '../types';

const KNOWN_KINDS: readonly CatalogKind[] = [
    'statement',
    'value',
    'type',
    'enum',
    'const',
    'not-node-able',
];

const NO_NAMES = { enumNames: new Set<string>(), typeNames: new Set<string>() };

describe('spec catalog (#7)', () => {
    it('search("cross") finds the cross product with kind and typed ports', () => {
        const hits = defaultCatalog.search('cross');
        const cross = hits.find((e) => e.name === 'cross');
        expect(cross).toBeDefined();
        expect(cross?.kind).toBe('value');
        expect(cross?.nodeable).toBe(true);
        expect(cross?.category).toBe('Math');
        expect(cross?.inputs).toEqual([
            expect.objectContaining({ name: 'vector1', valueType: 'Vector', scrapedType: 'Vector' }),
            expect.objectContaining({ name: 'vector2', valueType: 'Vector', scrapedType: 'Vector' }),
        ]);
        expect(cross?.outputs).toEqual([
            expect.objectContaining({ valueType: 'Vector', scrapedType: 'Vector' }),
        ]);
        for (const hit of hits) {
            expect(KNOWN_KINDS).toContain(hit.kind);
            expect(Array.isArray(hit.inputs)).toBe(true);
            for (const port of [...hit.inputs, ...hit.outputs]) {
                expect(typeof port.valueType).toBe('string');
            }
        }
    });

    it('list("Math") returns entries with kind and typed ports', () => {
        const math = defaultCatalog.list('Math');
        expect(math.length).toBeGreaterThan(0);
        for (const entry of math) {
            expect(entry.category).toBe('Math');
            expect(KNOWN_KINDS).toContain(entry.kind);
            // Port specs are always present; uncurated types are Unknown, never blank.
            for (const port of [...entry.inputs, ...entry.outputs]) {
                expect(port.valueType).not.toBe('');
            }
        }
        const cross = math.find((e) => e.name === 'cross');
        expect(cross?.kind).toBe('value');
        expect(cross?.nodeable).toBe(true);
        expect(cross?.inputs.every((p) => p.valueType === 'Vector')).toBe(true);
    });

    it('dedupes the library to the 1189 unique name+descriptor entries plus the synthetic instance-on-points utility', () => {
        // 1189 scraped name+descriptor entries + 1 synthetic utility entry
        // (#11: instanceOnPoints has no scraped entry).
        expect(defaultCatalog.entries.length).toBe(1190);
        const keys = defaultCatalog.entries.map((e) => e.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('unclassified entries default to not-node-able', () => {
        // Empty classification: nothing is on the allowlist, so nothing is a node.
        const catalog = buildCatalog(
            {
                categories: [
                    {
                        name: 'Math',
                        files: [
                            {
                                fileName: 'vector',
                                entries: [
                                    {
                                        name: 'cross',
                                        descriptor: '',
                                        signature: '(vector1 is Vector, vector2 is Vector)',
                                        returnType: 'Vector',
                                        parameters: [
                                            { name: 'vector1', type: 'Vector' },
                                            { name: 'vector2', type: 'Vector' },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            { entries: {} },
        );
        const entries = catalog.list('Math');
        expect(entries).toHaveLength(1);
        expect(entries[0]?.kind).toBe('not-node-able');
        expect(entries[0]?.nodeable).toBe(false);
        // Ports are still typed — the entry is described, just not node-able.
        expect(entries[0]?.inputs[0]?.valueType).toBe('Vector');
    });

    it('a classified entry with an uncurated (generic) port is not node-able', () => {
        const catalog = buildCatalog(
            {
                categories: [
                    {
                        name: 'Math',
                        files: [
                            {
                                fileName: 'box',
                                entries: [
                                    {
                                        name: 'canBeBox3d',
                                        descriptor: 'predicate',
                                        signature: '(value)',
                                        parameters: [{ name: 'value', type: 'value' }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            { entries: { 'canBeBox3d::predicate': 'value' } },
        );
        const entry = catalog.get('canBeBox3d::predicate');
        expect(entry?.kind).toBe('value');
        expect(entry?.inputs[0]?.valueType).toBe('Unknown');
        expect(entry?.nodeable).toBe(false);
    });

    it('curated type map: known types map, generics and junk are Unknown', () => {
        expect(mapScrapedType('Vector', NO_NAMES).valueType).toBe('Vector');
        expect(mapScrapedType('boolean', NO_NAMES).valueType).toBe('Boolean');
        expect(mapScrapedType('ValueWithUnits', NO_NAMES).valueType).toBe('ValueWithUnits');
        expect(mapScrapedType('Query', NO_NAMES).valueType).toBe('QueryList');
        expect(mapScrapedType('value', NO_NAMES).valueType).toBe('Unknown');
        expect(mapScrapedType('array', NO_NAMES).valueType).toBe('Unknown');
        expect(mapScrapedType('map', NO_NAMES).valueType).toBe('Unknown');
        expect(mapScrapedType('', NO_NAMES).valueType).toBe('Unknown');
        expect(mapScrapedType('Description', NO_NAMES).valueType).toBe('Unknown');
        // Data-driven rules: enum names and type names resolve from the library.
        const names = {
            enumNames: new Set(['EntityType']),
            typeNames: new Set(['Box3d']),
        };
        expect(mapScrapedType('EntityType', names)).toEqual({
            valueType: 'Enum',
            enumName: 'EntityType',
        });
        expect(mapScrapedType('Box3d', names).valueType).toBe('Box3d');
    });

    it('unknown category lists nothing; blank search finds nothing', () => {
        expect(defaultCatalog.list('NoSuchCategory')).toEqual([]);
        expect(defaultCatalog.search('')).toEqual([]);
        expect(defaultCatalog.search('   ')).toEqual([]);
    });
});

describe('standard-library generic definitions', () => {
    it('chamfer and fillet are node-able via the generic-definition path', () => {
        for (const name of ['chamfer', 'fillet']) {
            const entry = defaultCatalog.search(name).find((e) => e.name === name);
            expect(entry).toBeDefined();
            expect(entry?.kind).toBe('statement');
            expect(entry?.nodeable).toBe(true);
            expect(entry?.genericDefinition).toBe(true);
            expect(entry?.inputs.map((p) => p.name)).toContain('definition');
        }
    });

    it('opChamfer keeps its typed definition parameters', () => {
        const entry = defaultCatalog.entries.find((e) => e.name === 'opChamfer');
        expect(entry?.genericDefinition).toBe(true);
        expect(entry?.inputs).toContainEqual(
            expect.objectContaining({ name: 'entities', valueType: 'QueryList' }),
        );
    });

    it('a statement with an untyped definition child stays not-node-able', () => {
        const catalog = buildCatalog(
            {
                categories: [
                    {
                        name: 'Modeling',
                        files: [
                            {
                                fileName: 'f',
                                entries: [
                                    {
                                        name: 'mystery',
                                        descriptor: '',
                                        signature: '(context is Context, id is Id, definition is map)',
                                        parameters: [
                                            { name: 'context', type: 'Context' },
                                            { name: 'id', type: 'Id' },
                                            { name: 'definition', type: 'map' },
                                            { name: 'blob', type: 'value' },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            { entries: { 'mystery::': 'statement' } },
        );
        const entry = catalog.get('mystery::');
        expect(entry?.kind).toBe('statement');
        expect(entry?.nodeable).toBe(false);
        expect(entry?.genericDefinition).toBeUndefined();
    });
});
