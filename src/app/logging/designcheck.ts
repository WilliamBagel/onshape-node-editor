/**
 * #30: the design-rule check surface's model.
 *
 * The log store is already the single place every build/upload/run/editor
 * warning lands (`BuildLogStore`, `buildlog.ts`). Rather than invent a second
 * collection with its own flags, this module derives the check list and the
 * tab's state from those entries: one model, one recompute trigger (the store's
 * subscription), and stable ids so a locate action can target a row.
 *
 * Plain TypeScript, no Vue and no DOM, so the tab's logic is unit-testable.
 */

import type { LogEntry, LogSeverity } from './buildlog';
import { countBySeverity, highestSeverity } from './buildlog';

/** One row in the check surface. Derived from a `LogEntry`. */
export interface DesignCheck {
    /** Stable within a render: timestamp + source + position in the source list. */
    id: string;
    severity: Exclude<LogSeverity, 'info'>;
    message: string;
    /** Rete node id when the entry is about a node, so the row can locate it. */
    nodeId?: string;
    source: string;
    timestamp: number;
}

/**
 * The tab's reported state.
 *
 * `unchecked` is deliberately distinct from `clean`: the issue requires that a
 * graph nobody has built yet must not show a green check ("no check has run
 * yet" is not "no violations").
 */
export type DesignCheckState = 'unchecked' | 'clean' | 'warning' | 'error';

export interface DesignCheckSummary {
    state: DesignCheckState;
    counts: Record<LogSeverity, number>;
    total: number;
}

/** Sources whose presence means a build/upload/run has actually executed. */
const PIPELINE_SOURCES: readonly string[] = ['build', 'upload', 'run'];

/** True when at least one build/upload/run entry exists — i.e. a check has run. */
export function hasPipelineRun(entries: readonly LogEntry[]): boolean {
    return entries.some((entry) => PIPELINE_SOURCES.includes(entry.source));
}

/**
 * Every warning/error entry, in log order, as a `DesignCheck`.
 *
 * Info entries are not checks; a clean build is not a violation. Entries keep
 * their `nodeId` so the surface can offer "go to node".
 */
export function collectDesignChecks(entries: readonly LogEntry[]): DesignCheck[] {
    const checks: DesignCheck[] = [];
    for (const entry of entries) {
        if (entry.severity === 'info') continue;
        checks.push({
            id: `${entry.timestamp}:${entry.source}:${checks.length}`,
            severity: entry.severity,
            message: entry.message,
            nodeId: entry.nodeId,
            source: entry.source,
            timestamp: entry.timestamp,
        });
    }
    return checks;
}

/**
 * The tab's icon/label state, from the checks and whether a check ever ran.
 *
 * Error beats warning; with neither, a pipeline that has run reports `clean`
 * and one that has not reports `unchecked`.
 */
export function summarizeDesignChecks(
    checks: readonly DesignCheck[],
    pipelineHasRun: boolean,
): DesignCheckSummary {
    const counts = countBySeverity(checks);
    const highest = highestSeverity(checks);
    let state: DesignCheckState;
    if (highest === 'error') {
        state = 'error';
    } else if (highest === 'warning') {
        state = 'warning';
    } else {
        state = pipelineHasRun ? 'clean' : 'unchecked';
    }
    return { state, counts, total: checks.length };
}
