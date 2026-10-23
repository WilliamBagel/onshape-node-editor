/**
 * DR-001 load-time guard: does a saved graph depend on a live selection?
 *
 * `docs/design-rules.md` DR-001 forbids persisting a transient selection in a
 * saved graph: a selection carries a `workspaceMicroversionId` and a
 * `selectionId` that the next document edit invalidates, and the graph would
 * then silently break. The schema-v1 serializer (`serialization/
 * graph-schema-types.ts`) therefore writes every `QueryList` parameter with an
 * empty selection list.
 *
 * This guard exists because "the writer never does that" is not the same as
 * "nothing on disk ever contains it": hand-edited documents, documents written
 * by an older or buggy build, and any future change that starts persisting
 * selections all land here first. A document that *does* contain one is loaded
 * with a visible warning instead of failing silently later.
 *
 * Pure data in, strings out — no Vue, no editor, no Onshape — so it can be unit
 * tested and called from the loader the moment save/load exists (#6).
 */

interface StoredParameterValue {
    type?: unknown;
    value?: unknown;
}

interface StoredNode {
    id?: unknown;
    kind?: unknown;
    parameters?: unknown;
}

/**
 * One message per offending node, in document order.
 *
 * Never throws: a document that is not an object, has no `nodes` array, or
 * carries nodes of unexpected shapes yields `[]` rather than an exception, so it
 * is safe to call on anything that came off disk.
 */
export function describeLiveSelectionDependencies(graph: unknown): string[] {
    const nodes = extractNodes(graph);
    if (nodes == null) {
        return [];
    }

    const messages: string[] = [];

    for (const rawNode of nodes) {
        if (rawNode == null || typeof rawNode !== "object") {
            continue;
        }
        const node = rawNode as StoredNode;
        const parameters = node.parameters;
        if (parameters == null || typeof parameters !== "object") {
            continue;
        }

        const offending: string[] = [];
        for (const [parameterId, stored] of Object.entries(parameters as Record<string, StoredParameterValue>)) {
            if (stored == null || typeof stored !== "object") {
                continue;
            }
            if (stored.type !== "QueryList") {
                continue;
            }
            if (holdsAValue(stored.value)) {
                offending.push(parameterId);
            }
        }

        if (offending.length === 0) {
            continue;
        }

        messages.push(
            `DR-001: this saved graph depends on a live selection. Node "${labelOf(node)}" ` +
            `parameter(s) ${offending.map((id) => `"${id}"`).join(", ")} contain a captured selection, ` +
            `which does not survive a document edit. Re-select the geometry, or replace it with a ` +
            `re-evaluable Query.`
        );
    }

    return messages;
}

function extractNodes(graph: unknown): unknown[] | null {
    if (graph == null || typeof graph !== "object") {
        return null;
    }
    const nodes = (graph as { nodes?: unknown }).nodes;
    return Array.isArray(nodes) ? nodes : null;
}

/**
 * The DR-001-clean form is a strictly empty array (`{type: "QueryList", value: []}`).
 * Anything else — a non-empty array, an object, a string — is a selection we
 * cannot reconstruct, so it is reported.
 */
function holdsAValue(value: unknown): boolean {
    if (value == null) {
        return false;
    }
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    return true;
}

function labelOf(node: StoredNode): string {
    if (typeof node.id === "string" && node.id !== "") {
        return node.id;
    }
    return typeof node.kind === "string" ? node.kind : "(unidentified node)";
}
