/**
 * Graph sanitizer for the default/debug sample graph and `loadGraph`.
 *
 * Prunes only nodes that are *genuinely* not part of a legitimate graph:
 *  - transient group boundary cards (`group-input` / `group-output`) found
 *    outside group editing — they are definition-owned chrome, never
 *    top-level nodes (see `nodes/groupboundarynode.ts`);
 *  - duplicate node ids (the later occurrence);
 *  - `CustomFeature` nodes whose feature spec never resolved (no spec, or
 *    an empty `featureType`) — they cannot produce a FeatureScript line;
 *  - nodes whose `getFeatureScriptInfo` throws — they cannot produce a
 *    FeatureScript line either.
 *
 * Everything else is kept, including nodes with an empty statement line
 * (value/expression nodes contribute hoisted bindings instead) and muted
 * nodes. Graph-validator failures (`validateGraphNodes`) are never pruned
 * or swallowed here: they describe real user-graph problems, so those nodes
 * stay in place and the validator still throws with its full message.
 */
import type { NodeEditor } from "rete";
import type { Schemes } from "./types";
import { OnshapeNode } from "./nodes/onshapenode";
import { CustomFeatureNode } from "./nodes/customfeaturenode";
import { GroupBoundaryNode } from "./nodes/groupboundarynode";
import { FrameNode } from "./nodes/framenode";

export interface PrunedNode {
    nodeId: string;
    type: string;
    reason: string;
}

export interface SanitizeReport {
    kept: OnshapeNode[];
    pruned: PrunedNode[];
    /** Non-fatal observations about nodes that were kept. */
    warnings: string[];
}

export interface SanitizeOptions {
    /** True while the user is inside a group definition (Tab editing). */
    inGroupEdit: boolean;
}

function isBoundaryCard(node: OnshapeNode): boolean {
    return (
        node instanceof GroupBoundaryNode ||
        node.type === "group-input" ||
        node.type === "group-output"
    );
}

/** Classify one node; returns a prune reason or null when it stays. */
function pruneReason(node: OnshapeNode, seenIds: Set<string>, options: SanitizeOptions): string | null {
    if (seenIds.has(node.id)) {
        return `duplicate node id "${node.id}"`;
    }
    seenIds.add(node.id);

    if (isBoundaryCard(node) && !options.inGroupEdit) {
        return `transient group boundary card ("${node.type}") outside group editing (orphaned)`;
    }

    if (node instanceof CustomFeatureNode) {
        const spec = node.getFeatureSpec() as { featureType?: unknown } | null | undefined;
        if (spec == null || typeof spec.featureType !== "string" || spec.featureType === "") {
            return "CustomFeature node with missing/unresolved feature spec";
        }
    }

    if (!(node instanceof FrameNode) && node.muted !== true) {
        try {
            node.getFeatureScriptInfo({});
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return `cannot produce a FeatureScript line (threw: ${message})`;
        }
    }
    return null;
}

/**
 * Partition `nodes` into kept/pruned. Pure: mutates nothing, so callers can
 * decide how to apply the result (editor removal, dry-run checks, tests).
 */
export function sanitizeGraphNodes(
    nodes: readonly OnshapeNode[],
    options: SanitizeOptions,
): SanitizeReport {
    const kept: OnshapeNode[] = [];
    const pruned: PrunedNode[] = [];
    const warnings: string[] = [];
    const seenIds = new Set<string>();
    for (const node of nodes) {
        const reason = pruneReason(node, seenIds, options);
        if (reason != null) {
            pruned.push({ nodeId: node.id, type: node.type, reason });
            continue;
        }
        kept.push(node);
        // Empty statement lines are legitimate for value/expression nodes
        // (hoisted bindings) and for muted nodes; surface them, never prune.
        if (!(node instanceof FrameNode) && node.muted !== true && !isBoundaryCard(node)) {
            try {
                const line = node.getFeatureScriptInfo({})?.line ?? "";
                if (line.trim() === "") {
                    warnings.push(
                        `Node "${node.type}" (id "${node.id}") produces no FeatureScript line; kept (may contribute a hoisted binding).`,
                    );
                }
            } catch {
                // Already handled by pruneReason; unreachable in practice.
            }
        }
    }
    return { kept, pruned, warnings };
}

/** Sink for prune records: the app build log, with console as fallback. */
export type SanitizeLogger = (entry: { severity: "info" | "warning" | "error"; message: string; nodeId?: string }) => void;

/**
 * Remove the pruned nodes from a live editor and log what was removed, and
 * why, through `log` (default `console.warn`).
 */
export async function pruneInvalidNodes(
    editor: NodeEditor<Schemes>,
    options: SanitizeOptions,
    log: SanitizeLogger = (entry) => console.warn(`[graph-sanitize] ${entry.message}`),
): Promise<SanitizeReport> {
    const report = sanitizeGraphNodes(editor.getNodes(), options);
    for (const pruned of report.pruned) {
        // `removeNode` leaves model connections behind; drop the pruned
        // node's wires too so the saved graph cannot reference a missing node.
        for (const connection of [...editor.getConnections()]) {
            if (connection.source === pruned.nodeId || connection.target === pruned.nodeId) {
                await editor.removeConnection(connection.id);
            }
        }
        await editor.removeNode(pruned.nodeId);
        log({
            severity: "warning",
            message: `Pruned invalid node "${pruned.type}" (id "${pruned.nodeId}"): ${pruned.reason}`,
            nodeId: pruned.nodeId,
        });
    }
    for (const warning of report.warnings) {
        log({ severity: "info", message: warning });
    }
    return report;
}
