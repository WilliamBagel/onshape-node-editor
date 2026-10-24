/**
 * #4: L1 tests for the log entry model, severity handling, ordering and the
 * clipboard text. The Vue panel is deliberately not mounted here; everything it
 * displays comes from these functions.
 */
import { describe, expect, it, vi } from 'vitest';
import {
    BuildLogStore,
    DEFAULT_SEVERITY,
    SEVERITY_RANK,
    createLogEntry,
    countBySeverity,
    filterByMinSeverity,
    formatLogLine,
    formatLogText,
    formatTimestamp,
    highestSeverity,
    indentDetail,
    isAtLeastSeverity,
} from '../buildlog';
import { copyTextToClipboard } from '../clipboard';

/** 2026-01-02T03:04:05.006Z */
const FIXED = Date.UTC(2026, 0, 2, 3, 4, 5, 6);

describe('createLogEntry', () => {
    it('defaults the severity to info and stamps the entry from the clock', () => {
        const entry = createLogEntry({ source: 'build', message: 'Built.' }, () => FIXED);

        expect(entry).toEqual({
            severity: 'info',
            timestamp: FIXED,
            source: 'build',
            message: 'Built.',
        });
        expect(DEFAULT_SEVERITY).toBe('info');
    });

    it('takes the severity from the caller and never from the message text', () => {
        const errorText = createLogEntry({ source: 'upload', message: 'HTTP 500' }, () => FIXED);
        expect(errorText.severity).toBe('info');

        const explicit = createLogEntry(
            { severity: 'error', source: 'upload', message: 'HTTP 500' },
            () => FIXED,
        );
        expect(explicit.severity).toBe('error');
    });

    it('keeps a node id when given one and omits it otherwise', () => {
        const withNode = createLogEntry(
            { severity: 'warning', source: 'build', message: 'Missing input.', nodeId: 'node-7' },
            () => FIXED,
        );
        expect(withNode.nodeId).toBe('node-7');

        const withoutNode = createLogEntry({ source: 'build', message: 'Built.' }, () => FIXED);
        expect('nodeId' in withoutNode).toBe(false);

        const emptyNode = createLogEntry(
            { source: 'build', message: 'Built.', nodeId: '' },
            () => FIXED,
        );
        expect('nodeId' in emptyNode).toBe(false);
    });

    it('attaches a detail block and label only when there is a detail', () => {
        const built = createLogEntry(
            {
                source: 'build',
                message: 'Built.',
                detail: 'feature foo() {}',
                detailLabel: 'Generated FeatureScript',
            },
            () => FIXED,
        );
        expect(built.detail).toBe('feature foo() {}');
        expect(built.detailLabel).toBe('Generated FeatureScript');

        const noDetail = createLogEntry({ source: 'build', message: 'Built.' }, () => FIXED);
        expect('detail' in noDetail).toBe(false);
        expect('detailLabel' in noDetail).toBe(false);
    });

    it('honours an explicit timestamp over the clock', () => {
        const clock = vi.fn(() => FIXED + 5);
        const entry = createLogEntry({ source: 'run', message: 'Ran.', timestamp: FIXED }, clock);

        expect(entry.timestamp).toBe(FIXED);
        expect(clock).not.toHaveBeenCalled();
    });

    it('rejects an empty message or source instead of storing a blank line', () => {
        expect(() => createLogEntry({ source: 'build', message: '' }, () => FIXED)).toThrow(
            /message/,
        );
        expect(() => createLogEntry({ source: '', message: 'x' }, () => FIXED)).toThrow(/source/);
    });
});

describe('severity ordering', () => {
    const entries = [
        createLogEntry({ severity: 'warning', source: 'run', message: 'w' }, () => 1),
        createLogEntry({ severity: 'info', source: 'run', message: 'i' }, () => 2),
        createLogEntry({ severity: 'error', source: 'run', message: 'e' }, () => 3),
        createLogEntry({ severity: 'info', source: 'run', message: 'i2' }, () => 4),
    ];

    it('ranks info < warning < error', () => {
        expect(SEVERITY_RANK.info).toBeLessThan(SEVERITY_RANK.warning);
        expect(SEVERITY_RANK.warning).toBeLessThan(SEVERITY_RANK.error);

        expect(isAtLeastSeverity('warning', 'info')).toBe(true);
        expect(isAtLeastSeverity('info', 'warning')).toBe(false);
        expect(isAtLeastSeverity('error', 'error')).toBe(true);
    });

    it('filters by minimum severity without reordering the log', () => {
        expect(filterByMinSeverity(entries, 'info').map((e) => e.message)).toEqual([
            'w',
            'i',
            'e',
            'i2',
        ]);
        expect(filterByMinSeverity(entries, 'warning').map((e) => e.message)).toEqual(['w', 'e']);
        expect(filterByMinSeverity(entries, 'error').map((e) => e.message)).toEqual(['e']);
    });

    it('reports the highest severity present and per-severity counts', () => {
        expect(highestSeverity([])).toBeUndefined();
        expect(highestSeverity(entries)).toBe('error');
        expect(highestSeverity(entries.slice(0, 2))).toBe('warning');
        expect(countBySeverity(entries)).toEqual({ info: 2, warning: 1, error: 1 });
    });
});

describe('formatting', () => {
    it('formats a timestamp as HH:MM:SS.mmm (UTC when asked)', () => {
        expect(formatTimestamp(FIXED, true)).toBe('03:04:05.006');
        expect(formatTimestamp(Date.UTC(2026, 0, 2, 13, 0, 0, 42), true)).toBe('13:00:00.042');
    });

    it('formats one aligned panel line, with the node id when present', () => {
        // utc=true pins the clock part; the panel itself asks for local time.
        expect(
            formatLogLine(
                { severity: 'error', timestamp: FIXED, source: 'upload', message: 'HTTP 401 Unauthorized' },
                true,
            ),
        ).toBe('03:04:05.006  ERROR   upload: HTTP 401 Unauthorized');

        expect(
            formatLogLine(
                {
                    severity: 'warning',
                    timestamp: FIXED,
                    source: 'build',
                    message: 'Chamfer needs a body',
                    nodeId: 'n7',
                },
                true,
            ),
        ).toBe('03:04:05.006  WARNING build (node n7): Chamfer needs a body');
    });

    it('keeps a multi-line message intact in the line', () => {
        const line = formatLogLine({
            severity: 'error',
            timestamp: FIXED,
            source: 'upload',
            message: 'line one\nline two',
        });
        expect(line).toContain('line one\nline two');
    });

    it('indents detail blocks so they cannot be mistaken for entries', () => {
        expect(indentDetail('a\nb')).toBe('    a\n    b');
    });

    it('assembles the clipboard text: one line per entry, details indented', () => {
        const entries = [
            createLogEntry(
                { severity: 'info', source: 'build', message: 'Built.', timestamp: FIXED },
                () => FIXED,
            ),
            createLogEntry(
                {
                    severity: 'error',
                    source: 'upload',
                    message: 'HTTP 500 upstream said no',
                    timestamp: FIXED + 1,
                    detail: 'ERROR: bad thing\nat line 2',
                    detailLabel: 'Response body',
                },
                () => FIXED,
            ),
        ];

        expect(formatLogText(entries, true, true)).toBe(
            [
                '03:04:05.006  INFO    build: Built.',
                '03:04:05.007  ERROR   upload: HTTP 500 upstream said no',
                '    ERROR: bad thing',
                '    at line 2',
            ].join('\n'),
        );

        expect(formatLogText(entries, false, true)).toBe(
            [
                '03:04:05.006  INFO    build: Built.',
                '03:04:05.007  ERROR   upload: HTTP 500 upstream said no',
            ].join('\n'),
        );
    });

    it('renders a text/plain upstream body verbatim, quotes and newlines included', () => {
        const body = 'Onshape said: "Bad Request"\n{"not":"json it should parse"}';
        const entry = createLogEntry(
            { severity: 'error', source: 'upload', message: body, timestamp: FIXED },
            () => FIXED,
        );

        expect(entry.message).toBe(body);
        expect(formatLogText([entry], true, true)).toBe(`03:04:05.006  ERROR   upload: ${body}`);
    });
});

describe('BuildLogStore', () => {
    it('appends entries in call order and stamps them from its clock', () => {
        let now = 1000;
        const store = new BuildLogStore(() => now);

        store.add({ source: 'build', message: 'first' });
        now = 1001;
        store.add({ severity: 'error', source: 'upload', message: 'second' });

        expect(store.entries.map((entry) => entry.message)).toEqual(['first', 'second']);
        expect(store.entries.map((entry) => entry.timestamp)).toEqual([1000, 1001]);
        expect(store.entries.map((entry) => entry.severity)).toEqual(['info', 'error']);
    });

    it('notifies subscribers on add and clear, and stops after unsubscribe', () => {
        const store = new BuildLogStore(() => FIXED);
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);

        store.add({ source: 'build', message: 'Built.' });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0]).toHaveLength(1);

        store.clear();
        expect(listener).toHaveBeenCalledTimes(2);
        expect(store.entries).toHaveLength(0);

        unsubscribe();
        unsubscribe();
        store.add({ source: 'build', message: 'Again.' });
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('hands subscribers a fresh array each time so a Vue ref actually updates', () => {
        const store = new BuildLogStore(() => FIXED);
        const seen: (readonly unknown[])[] = [];
        store.subscribe((entries) => seen.push(entries));

        store.add({ source: 'run', message: 'first' });
        store.add({ source: 'run', message: 'second' });

        expect(seen[0]).not.toBe(seen[1]);
        expect(seen[0]).toHaveLength(1);
        expect(seen[1]).toHaveLength(2);
    });

    it('does not notify on a clear of an already-empty log', () => {
        const store = new BuildLogStore(() => FIXED);
        const listener = vi.fn();
        store.subscribe(listener);

        store.clear();

        expect(listener).not.toHaveBeenCalled();
    });

    it('copies exactly what the panel shows', () => {
        const store = new BuildLogStore(() => FIXED);
        store.add({ source: 'build', message: 'Built.' });
        store.add({
            severity: 'warning',
            source: 'run',
            message: 'Run is not implemented yet.',
        });

        expect(store.copyText()).toBe(formatLogText(store.entries));
        // Two entries, so one separator line between them.
        expect(store.copyText().split('\n')).toHaveLength(2);
    });
});

describe('copyTextToClipboard', () => {
    it('uses navigator.clipboard when available', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });

        await expect(copyTextToClipboard('log text')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('log text');
    });

    it('reports failure instead of throwing when the clipboard rejects and there is no DOM', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('denied'));
        vi.stubGlobal('navigator', { clipboard: { writeText } });

        await expect(copyTextToClipboard('log text')).resolves.toBe(false);
    });

    it('does not touch the clipboard for empty text', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });

        await expect(copyTextToClipboard('')).resolves.toBe(false);
        expect(writeText).not.toHaveBeenCalled();
    });

    it('returns false when no clipboard API exists at all', async () => {
        vi.stubGlobal('navigator', {});

        await expect(copyTextToClipboard('log text')).resolves.toBe(false);
    });
});
