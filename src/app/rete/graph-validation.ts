/**
 * Issue #12 — build-time graph validation.
 *
 * Iteration over a `Query`, and `for` loops with no bound, must be refused
 * before code reaches Onshape. Every node can override
 * {@link OnshapeNode.validateGraph} to return a refusal message; this
 * helper runs all of them (wired with the producing node/output per input)
 * and throws naming every offending node, so `generateFeatureStudioSource`
 * fails fast with a message the user can act on.
 */
import type { GraphProducer, OnshapeNode } from "./nodes/onshapenode";

export interface GraphValidationEntry {
    node: OnshapeNode;
    /** Input key -> producing node/output (empty for unwired inputs). */
    producers: Record<string, GraphProducer>;
}

/**
 * Run validation over every node. Never returns an error: it throws an
 * `Error` whose message names each offending node (type, title and id) and
 * the reason. Valid graphs return normally.
 */
export function validateGraphNodes(
    entries: readonly GraphValidationEntry[],
    getNode: (id: string) => OnshapeNode | undefined,
): void {
    const problems: string[] = [];
    for (const entry of entries) {
        const message = entry.node.validateGraph({ producers: entry.producers, getNode });
        if (message != null) {
            problems.push(
                `Node "${entry.node.type}" (title "${entry.node.getTitle()}", id "${entry.node.id}"): ${message}`,
            );
        }
    }
    if (problems.length > 0) {
        throw new Error(`Graph validation failed:\n${problems.join("\n")}`);
    }
}
