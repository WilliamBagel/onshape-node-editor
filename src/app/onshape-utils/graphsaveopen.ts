/**
 * Issue #6 — verified Save (and, later, Open) orchestration.
 *
 * The Onshape app-element storage (`AppStorage`/`NodeStore`) is awkward to
 * unit-test against, so the save policy lives here behind injected seams:
 * a `serialize` function (the editor's serializer, in the app) and a
 * `GraphStorage` (`write` + `read`, backed by a `NodeStore` element in the
 * app and by an in-memory stub in tests). The policy is strict: a save is
 * only reported as successful when the bytes read back from storage are
 * exactly the bytes that were written. A failed write, a failed read-back,
 * or a read-back that differs in any way is a failure — never a success.
 */

export interface GraphStorage {
    /** Write the serialized graph into the graph element. Rejects on failure. */
    write(reteJSON: string): Promise<void>;
    /** Read the serialized graph back from the graph element. */
    read(): Promise<string | undefined>;
}

export type SaveOutcome =
    | { status: 'saved'; bytes: number }
    | { status: 'failed'; stage: 'serialize' | 'write' | 'read-back'; message: string };

export interface SaveGraphDeps {
    /** The editor's serialized form, e.g. `JSON.stringify(serializeGraph(...))`. */
    serialize: () => string;
    storage: GraphStorage;
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Serialize, write, read back, and compare — in that order.
 *
 * Success requires an exact round-trip: `read()` must return the identical
 * string `serialize()` produced. Anything else (serializer throws, write
 * throws, read-back throws, read-back is empty/missing or differs) comes
 * back as `{ status: 'failed', stage, message }` naming the stage that
 * failed, so the caller can report it instead of claiming a save.
 */
export async function saveGraphVerified(deps: SaveGraphDeps): Promise<SaveOutcome> {
    let reteJSON: string;
    try {
        reteJSON = deps.serialize();
    } catch (error) {
        return { status: 'failed', stage: 'serialize', message: `Could not serialize the graph: ${describeError(error)}` };
    }
    if (typeof reteJSON !== 'string' || reteJSON === '') {
        return { status: 'failed', stage: 'serialize', message: 'Could not serialize the graph: the serializer produced no output.' };
    }

    try {
        await deps.storage.write(reteJSON);
    } catch (error) {
        return { status: 'failed', stage: 'write', message: `Writing the graph failed: ${describeError(error)}` };
    }

    let readBack: string | undefined;
    try {
        readBack = await deps.storage.read();
    } catch (error) {
        return { status: 'failed', stage: 'read-back', message: `Reading the graph back after writing failed: ${describeError(error)}` };
    }
    if (readBack !== reteJSON) {
        const detail = readBack === undefined
            ? 'nothing was read back'
            : `the read-back differed (${readBack.length} bytes read back, ${reteJSON.length} bytes written)`;
        return {
            status: 'failed',
            stage: 'read-back',
            message: `Save did not round-trip: ${detail}. The graph was not saved.`,
        };
    }

    return { status: 'saved', bytes: reteJSON.length };
}
