/**
 * #4: the typed build/upload/run log.
 *
 * This module is deliberately plain TypeScript (no Vue, no DOM): the entry
 * shape, the ordering/severity rules and the text assembled for the clipboard
 * are testable in vitest's node environment. `LogPanel.vue` only renders it.
 *
 * Severity is decided by the caller. Nothing here looks at the message text;
 * a `/api` proxy error body is opaque text and is stored verbatim.
 */

export type LogSeverity = 'info' | 'warning' | 'error';

/** Where an entry came from. The pipeline sources have dedicated helpers. */
export type LogSource = 'build' | 'upload' | 'run' | 'editor' | (string & {});

export interface LogEntry {
    severity: LogSeverity;
    /** Milliseconds since the epoch. */
    timestamp: number;
    source: LogSource;
    message: string;
    /** Rete node id, when the entry is about one node. */
    nodeId?: string;
    /**
     * Long-form payload the panel shows in a monospace viewer and copies as
     * part of the log: the generated FeatureScript for a build, a verbatim
     * upstream error body for a failed upload, ...
     */
    detail?: string;
    /** Heading for `detail`, e.g. `Generated FeatureScript`. */
    detailLabel?: string;
}

export interface LogEntryInput {
    severity?: LogSeverity;
    source: LogSource;
    message: string;
    nodeId?: string;
    detail?: string;
    detailLabel?: string;
    /** Overrides the store's clock. Used by tests. */
    timestamp?: number;
}

/** The funnel's default: `reportMessage` is informational unless told otherwise. */
export const DEFAULT_SEVERITY: LogSeverity = 'info';

/** Higher is more severe. Used for threshold filters, never for guessing. */
export const SEVERITY_RANK: Record<LogSeverity, number> = {
    info: 0,
    warning: 1,
    error: 2,
};

export const SEVERITY_ORDER: readonly LogSeverity[] = ['info', 'warning', 'error'];

/**
 * Build one entry. `timestamp` comes from `now` so callers do not need a
 * clock; a caller that already has a timestamp can pass it explicitly.
 */
export function createLogEntry(
    input: LogEntryInput,
    now: () => number = Date.now,
): LogEntry {
    if (input.message == null || input.message === '') {
        throw new Error('createLogEntry: message must be a non-empty string');
    }
    if (typeof input.source !== 'string' || input.source === '') {
        throw new Error('createLogEntry: source must be a non-empty string');
    }

    const entry: LogEntry = {
        severity: input.severity ?? DEFAULT_SEVERITY,
        timestamp: input.timestamp ?? now(),
        source: input.source,
        message: input.message,
    };
    if (input.nodeId != null && input.nodeId !== '') {
        entry.nodeId = input.nodeId;
    }
    if (input.detail != null && input.detail !== '') {
        entry.detail = input.detail;
        entry.detailLabel = input.detailLabel;
    }
    return entry;
}

/** `false`/`true` rather than -1/1, so it reads like a predicate at call sites. */
export function isAtLeastSeverity(severity: LogSeverity, minimum: LogSeverity): boolean {
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum];
}

/** Entries at or above `minimum`, in their original (chronological) order. */
export function filterByMinSeverity(
    entries: readonly LogEntry[],
    minimum: LogSeverity,
): LogEntry[] {
    return entries.filter((entry) => isAtLeastSeverity(entry.severity, minimum));
}

/** The most severe level present, or `undefined` for an empty log. */
export function highestSeverity(entries: readonly LogEntry[]): LogSeverity | undefined {
    let highest: LogSeverity | undefined;
    for (const entry of entries) {
        if (highest === undefined || SEVERITY_RANK[entry.severity] > SEVERITY_RANK[highest]) {
            highest = entry.severity;
        }
    }
    return highest;
}

export function countBySeverity(entries: readonly LogEntry[]): Record<LogSeverity, number> {
    const counts: Record<LogSeverity, number> = { info: 0, warning: 0, error: 0 };
    for (const entry of entries) {
        counts[entry.severity] += 1;
    }
    return counts;
}

function pad(value: number, width: number): string {
    return value.toString().padStart(width, '0');
}

/**
 * `HH:MM:SS.mmm`. Local time by default, which is what a person reading the
 * panel wants; pass `utc` in tests so the expected string is stable.
 */
export function formatTimestamp(timestamp: number, utc = false): string {
    const date = new Date(timestamp);
    const hours = utc ? date.getUTCHours() : date.getHours();
    const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
    const seconds = utc ? date.getUTCSeconds() : date.getSeconds();
    return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(date.getMilliseconds(), 3)}`;
}

/**
 * One panel line / one copied line:
 *
 *     12:00:01.250  ERROR    upload  (node n7): HTTP 401 Unauthorized
 *
 * The severity column is padded so lines stay aligned in the monospace view.
 */
export function formatLogLine(entry: LogEntry, utc = false): string {
    const severity = entry.severity.toUpperCase().padEnd(7);
    const node = entry.nodeId !== undefined ? ` (node ${entry.nodeId})` : '';
    return `${formatTimestamp(entry.timestamp, utc)}  ${severity} ${entry.source}${node}: ${entry.message}`;
}

/** Indent a `detail` block so it cannot be mistaken for another entry. */
export function indentDetail(detail: string): string {
    return detail
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
}

/**
 * The clipboard payload: one line per entry, with any detail block indented
 * beneath its entry. This is the whole log; the panel's Copy button hands the
 * result to `copyTextToClipboard`.
 */
export function formatLogText(
    entries: readonly LogEntry[],
    includeDetails = true,
    utc = false,
): string {
    return entries
        .map((entry) => {
            const line = formatLogLine(entry, utc);
            if (!includeDetails || entry.detail === undefined) return line;
            return `${line}\n${indentDetail(entry.detail)}`;
        })
        .join('\n');
}

/**
 * The live log. Plain object with a subscriber list so the Vue panel can stay
 * thin; the store owns insertion order (append-only, chronological).
 */
export class BuildLogStore {
    private items: LogEntry[] = [];
    private readonly listeners = new Set<(entries: readonly LogEntry[]) => void>();
    private readonly now: () => number;

    constructor(now: () => number = Date.now) {
        this.now = now;
    }

    public get entries(): readonly LogEntry[] {
        return this.items;
    }

    /** Construct an entry and append it. Returns the entry it stored. */
    public add(input: LogEntryInput): LogEntry {
        const entry = createLogEntry(input, this.now);
        this.items.push(entry);
        this.emit();
        return entry;
    }

    public addEntry(entry: LogEntry): LogEntry {
        this.items.push(entry);
        this.emit();
        return entry;
    }

    public clear(): void {
        if (this.items.length === 0) return;
        this.items = [];
        this.emit();
    }

    /** `unsubscribe` is idempotent. */
    public subscribe(listener: (entries: readonly LogEntry[]) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public filter(minimum: LogSeverity): LogEntry[] {
        return filterByMinSeverity(this.items, minimum);
    }

    /** Clipboard text for every entry currently in the log. */
    public copyText(): string {
        return formatLogText(this.items);
    }

    private emit(): void {
        // A fresh array each time: a listener that stores it in a Vue `ref`
        // must see a new reference or its render will not update.
        const snapshot = this.items.slice();
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }
}
