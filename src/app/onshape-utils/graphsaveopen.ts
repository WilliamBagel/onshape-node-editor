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

/* ------------------------------------------------------------------ */
/* Open                                                                */
/* ------------------------------------------------------------------ */

/** One saved graph, as listed for the user to pick. */
export interface GraphListing {
    /** Graph element id (the `NodeStore` element holding the graph). */
    id: string;
    /** Graph name (the element name without the ` graph` suffix). */
    name: string;
}

export type OpenOutcome =
    | { status: 'opened'; graphName: string; nodes: number; warnings: string[] }
    | { status: 'cancelled' }
    | { status: 'empty' }
    | { status: 'failed'; stage: 'list' | 'read' | 'load'; message: string };

export interface OpenGraphDeps {
    /** Saved graphs in this document, in the order to offer them. */
    list(): Promise<GraphListing[]>;
    /** Let the user pick one; resolves with its id, or `null` on cancel. */
    choose(list: GraphListing[]): Promise<string | null>;
    /** Confirm replacing the current editor content; `false` cancels. */
    confirmReplace(graphName: string): Promise<boolean>;
    /** Read one saved graph's serialized form. */
    read(id: string): Promise<string | undefined>;
    /** Replace the editor's contents with a serialized graph. Throws on failure. */
    apply(reteJSON: string): Promise<{ nodes: number; warnings: string[] }>;
}

/**
 * List, let the user choose, confirm, read, and load — in that order.
 * Cancelling at either prompt, or finding nothing to open, is a
 * `cancelled`/`empty` outcome and never touches the editor. A graph that
 * cannot be read or loaded is a `failed` outcome naming the stage; the
 * editor is only replaced once the stored document has loaded.
 */
export async function openGraph(deps: OpenGraphDeps): Promise<OpenOutcome> {
    let graphs: GraphListing[];
    try {
        graphs = await deps.list();
    } catch (error) {
        return { status: 'failed', stage: 'list', message: `Listing saved graphs failed: ${describeError(error)}` };
    }
    if (graphs.length === 0) {
        return { status: 'empty' };
    }

    const chosenId = await deps.choose(graphs);
    if (chosenId === null) {
        return { status: 'cancelled' };
    }
    const chosen = graphs.find((graph) => graph.id === chosenId);
    if (chosen === undefined) {
        return { status: 'failed', stage: 'list', message: 'The selected graph is no longer in the list.' };
    }

    let confirmed = false;
    try {
        confirmed = await deps.confirmReplace(chosen.name);
    } catch (error) {
        return { status: 'failed', stage: 'load', message: `Confirming the replacement failed: ${describeError(error)}` };
    }
    if (!confirmed) {
        return { status: 'cancelled' };
    }

    let reteJSON: string | undefined;
    try {
        reteJSON = await deps.read(chosen.id);
    } catch (error) {
        return { status: 'failed', stage: 'read', message: `Reading graph "${chosen.name}" failed: ${describeError(error)}` };
    }
    if (reteJSON === undefined || reteJSON === '') {
        return { status: 'failed', stage: 'read', message: `Graph "${chosen.name}" has no saved content to open.` };
    }

    try {
        const loaded = await deps.apply(reteJSON);
        return { status: 'opened', graphName: chosen.name, nodes: loaded.nodes, warnings: loaded.warnings };
    } catch (error) {
        return { status: 'failed', stage: 'load', message: `Loading graph "${chosen.name}" failed: ${describeError(error)}` };
    }
}
