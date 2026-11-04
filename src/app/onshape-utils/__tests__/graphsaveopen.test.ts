/**
 * #6: unit tests for the verified Save/Open orchestration.
 *
 * Storage is an in-memory stub implementing the same `write`/`read`
 * shape the app backs with a `NodeStore` element, so the round-trip
 * policy (success only on an exact read-back) and the open-cancel
 * paths are exercised without Onshape.
 */
import { describe, expect, it } from 'vitest';
import {
    openGraph,
    saveGraphVerified,
    type GraphListing,
    type GraphStorage,
} from '../graphsaveopen';

/** In-memory `GraphStorage` stub with failure/mismatch switches. */
class StubStorage implements GraphStorage {
    data: string | undefined;
    failWrite = false;
    failRead = false;
    corruptReadBack = false;
    writes = 0;

    async write(reteJSON: string): Promise<void> {
        this.writes += 1;
        if (this.failWrite) {
            throw new Error('network down');
        }
        this.data = reteJSON;
    }

    async read(): Promise<string | undefined> {
        if (this.failRead) {
            throw new Error('read timed out');
        }
        if (this.corruptReadBack && this.data !== undefined) {
            return `${this.data} `;
        }
        return this.data;
    }
}

const DOCUMENT = '{"schemaVersion":2,"nodes":[],"connections":[],"nodeOrder":[]}';

describe('saveGraphVerified', () => {
    it('reports success only on an exact round-trip', async () => {
        const storage = new StubStorage();
        const outcome = await saveGraphVerified({
            serialize: () => DOCUMENT,
            storage,
        });
        expect(outcome).toEqual({ status: 'saved', bytes: DOCUMENT.length });
        expect(storage.writes).toBe(1);
        expect(storage.data).toBe(DOCUMENT);
    });

    it('reports a failed write as a write-stage failure, never as success', async () => {
        const storage = new StubStorage();
        storage.failWrite = true;
        const outcome = await saveGraphVerified({
            serialize: () => DOCUMENT,
            storage,
        });
        expect(outcome.status).toBe('failed');
        if (outcome.status === 'failed') {
            expect(outcome.stage).toBe('write');
            expect(outcome.message).toContain('network down');
        }
        expect(storage.data).toBeUndefined();
    });

    it('reports a read-back mismatch (and a missing read-back) instead of claiming success', async () => {
        const corrupt = new StubStorage();
        corrupt.corruptReadBack = true;
        const mismatch = await saveGraphVerified({
            serialize: () => DOCUMENT,
            storage: corrupt,
        });
        expect(mismatch.status).toBe('failed');
        if (mismatch.status === 'failed') {
            expect(mismatch.stage).toBe('read-back');
            expect(mismatch.message).toContain('did not round-trip');
        }

        const empty = new StubStorage();
        empty.data = undefined;
        // Simulate a write that silently stored nothing.
        empty.write = async () => {};
        const missing = await saveGraphVerified({
            serialize: () => DOCUMENT,
            storage: empty,
        });
        expect(missing.status).toBe('failed');
        if (missing.status === 'failed') {
            expect(missing.stage).toBe('read-back');
        }
    });

    it('reports a failed read-back and a throwing serializer with their stage', async () => {
        const unreadable = new StubStorage();
        unreadable.failRead = true;
        const readOutcome = await saveGraphVerified({
            serialize: () => DOCUMENT,
            storage: unreadable,
        });
        expect(readOutcome.status).toBe('failed');
        if (readOutcome.status === 'failed') {
            expect(readOutcome.stage).toBe('read-back');
            expect(readOutcome.message).toContain('read timed out');
        }

        const serializeOutcome = await saveGraphVerified({
            serialize: () => {
                throw new Error('editor gone');
            },
            storage: new StubStorage(),
        });
        expect(serializeOutcome.status).toBe('failed');
        if (serializeOutcome.status === 'failed') {
            expect(serializeOutcome.stage).toBe('serialize');
        }
    });
});

describe('openGraph', () => {
    const graphs: GraphListing[] = [
        { id: 'element-1', name: 'Bracket' },
        { id: 'element-2', name: 'Chamfer' },
    ];

    it('opens the chosen graph after confirmation', async () => {
        const applied: string[] = [];
        const outcome = await openGraph({
            list: async () => graphs,
            choose: async (list) => list[1]?.id ?? null,
            confirmReplace: async () => true,
            read: async () => DOCUMENT,
            apply: async (reteJSON) => {
                applied.push(reteJSON);
                return { nodes: 3, warnings: [] };
            },
        });
        expect(outcome).toEqual({ status: 'opened', graphName: 'Chamfer', nodes: 3, warnings: [] });
        expect(applied).toEqual([DOCUMENT]);
    });

    it('cancels without touching the editor when the picker is cancelled', async () => {
        let readCalled = false;
        let applied = false;
        const outcome = await openGraph({
            list: async () => graphs,
            choose: async () => null,
            confirmReplace: async () => true,
            read: async () => {
                readCalled = true;
                return DOCUMENT;
            },
            apply: async () => {
                applied = true;
                return { nodes: 0, warnings: [] };
            },
        });
        expect(outcome).toEqual({ status: 'cancelled' });
        expect(readCalled).toBe(false);
        expect(applied).toBe(false);
    });

    it('cancels without touching the editor when the replace confirmation is refused', async () => {
        let readCalled = false;
        let applied = false;
        const outcome = await openGraph({
            list: async () => graphs,
            choose: async () => graphs[0]?.id ?? null,
            confirmReplace: async () => false,
            read: async () => {
                readCalled = true;
                return DOCUMENT;
            },
            apply: async () => {
                applied = true;
                return { nodes: 0, warnings: [] };
            },
        });
        expect(outcome).toEqual({ status: 'cancelled' });
        expect(readCalled).toBe(false);
        expect(applied).toBe(false);
    });

    it('reports an empty list and a load failure with their stage', async () => {
        const empty = await openGraph({
            list: async () => [],
            choose: async () => null,
            confirmReplace: async () => true,
            read: async () => DOCUMENT,
            apply: async () => ({ nodes: 0, warnings: [] }),
        });
        expect(empty).toEqual({ status: 'empty' });

        const failed = await openGraph({
            list: async () => graphs,
            choose: async () => graphs[0]?.id ?? null,
            confirmReplace: async () => true,
            read: async () => DOCUMENT,
            apply: async () => {
                throw new Error('spec "X" not found');
            },
        });
        expect(failed.status).toBe('failed');
        if (failed.status === 'failed') {
            expect(failed.stage).toBe('load');
            expect(failed.message).toContain('spec "X" not found');
        }
    });
});
