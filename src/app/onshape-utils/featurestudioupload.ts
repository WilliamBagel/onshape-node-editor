/**
 * Upload the generated FeatureScript to a Feature Studio (issue #1).
 *
 * The graph build path ends in `generateFeatureStudioSource()`; this module is
 * what puts that string into an Onshape Feature Studio. It goes through the
 * app's own `/api` proxy by calling the vendored `FeatureStudioApi` object the
 * app already holds (`OnshapeAPI.featureStudioApi`), so nothing here talks HTTP
 * directly and the OAuth token and `X-Server` header stay on the existing path.
 *
 * Two things this module is careful about:
 *
 * 1. **The payload is byte-exact.** `contents` is the string the generator
 *    returned: no `trim()`, no BOM strip, no newline fix-up, no re-indent. The
 *    generator owns the source (DR-002), and a Feature Studio whose first
 *    character changed is a different file. `buildUpdateContentsRequest()` is
 *    the only place the body is constructed, so a test can pin it.
 * 2. **Overwrites are shown, not assumed.** The studio's current contents are
 *    read first and the caller gets a line-level diff plus a confirm callback.
 *    A studio that does not exist yet is created with `createFeatureStudio`.
 *
 * Failures carry the upstream response text *verbatim*: the `/api` proxy answers
 * errors as `text/plain`, and the vendored client throws a `ResponseError` whose
 * `.message` is the useless `"Response returned an error code"` — the body has
 * to be read off `error.response`. Issue #4 builds the real log panel; this
 * module only hands strings to a `notify` callback.
 *
 * Pure-ish: Onshape access is injected as an interface, so the whole flow is
 * exercised by unit tests against a stub (L2).
 */

import type {
    BTDocumentElementInfo,
    BTFeatureStudioContents2239,
    BTModelElementParams,
} from 'onshape-typescript-fetch';
import {
    FeatureStudioTarget,
    TargetParseResult,
    validateTarget,
} from './featurestudiotarget';

/* ------------------------------------------------------------------ *
 * Request shapes (mirrors of the vendored request interfaces)
 * ------------------------------------------------------------------ */

export interface FeatureStudioContentsRequest {
    did: string;
    wvm: string;
    wvmid: string;
    eid: string;
}

export interface UpdateFeatureStudioContentsRequest extends FeatureStudioContentsRequest {
    bTFeatureStudioContents2239?: BTFeatureStudioContents2239;
}

export interface CreateFeatureStudioRequest {
    did: string;
    /** `createFeatureStudio` takes a *workspace* id, never a version/microversion. */
    wid: string;
    bTModelElementParams: BTModelElementParams;
}

/**
 * The slice of `FeatureStudioApi` this module needs.
 *
 * Declared structurally so a stub with jest/vitest mocks satisfies it, and so
 * the real `FeatureStudioApi` (whose methods take an extra optional
 * `initOverrides` argument) is assignable without a cast.
 */
export interface FeatureStudioApiLike {
    getFeatureStudioContents(request: FeatureStudioContentsRequest): Promise<BTFeatureStudioContents2239>;
    updateFeatureStudioContents(
        request: UpdateFeatureStudioContentsRequest,
    ): Promise<BTFeatureStudioContents2239>;
    createFeatureStudio(request: CreateFeatureStudioRequest): Promise<BTDocumentElementInfo>;
}

/**
 * The one place the write body is built.
 *
 * `contents` is passed through untouched — this function is the DR-002 boundary
 * between "the generator produced this" and "Onshape is being asked to store
 * it", and any normalisation here would silently rewrite the generated file.
 */
export function buildUpdateContentsRequest(
    target: FeatureStudioTarget,
    contents: string,
): UpdateFeatureStudioContentsRequest {
    return {
        did: target.did,
        wvm: target.wvm,
        wvmid: target.wvmid,
        eid: target.eid,
        bTFeatureStudioContents2239: { contents },
    };
}

/* ------------------------------------------------------------------ *
 * Line diff
 * ------------------------------------------------------------------ */

export type DiffOp = 'same' | 'add' | 'remove';

export interface DiffRow {
    op: DiffOp;
    line: string;
}

export interface LineDiff {
    rows: DiffRow[];
    added: number;
    removed: number;
    /** True when the two texts are byte-identical (nothing to overwrite). */
    identical: boolean;
}

/** Split into lines for *display* only; the payload is never split or joined. */
function toLines(text: string): string[] {
    if (text === '') return [];
    const withoutFinalNewline = text.endsWith('\n') ? text.slice(0, -1) : text;
    return withoutFinalNewline.split('\n');
}

/** Beyond this many cells the LCS table is not worth building; fall back to a block replace. */
const LCS_CELL_LIMIT = 400_000;

/**
 * Line-level diff (LCS) between the studio's current contents and the generated
 * source. Common prefix/suffix are trimmed first, which keeps the table small
 * for the usual case of "a few nodes changed".
 */
export function diffLines(before: string, after: string): LineDiff {
    if (before === after) {
        return {
            rows: toLines(before).map((line) => ({ op: 'same' as DiffOp, line })),
            added: 0,
            removed: 0,
            identical: true,
        };
    }

    const oldLines = toLines(before);
    const newLines = toLines(after);

    let prefix = 0;
    while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
        prefix++;
    }
    let suffix = 0;
    while (
        suffix < oldLines.length - prefix &&
        suffix < newLines.length - prefix &&
        oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
    ) {
        suffix++;
    }

    const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
    const newMiddle = newLines.slice(prefix, newLines.length - suffix);

    const rows: DiffRow[] = [];
    for (let i = 0; i < prefix; i++) rows.push({ op: 'same', line: oldLines[i] });

    const middleRows = diffMiddle(oldMiddle, newMiddle);
    rows.push(...middleRows);

    for (let i = oldLines.length - suffix; i < oldLines.length; i++) rows.push({ op: 'same', line: oldLines[i] });

    let added = 0;
    let removed = 0;
    for (const row of rows) {
        if (row.op === 'add') added++;
        else if (row.op === 'remove') removed++;
    }

    return { rows, added, removed, identical: false };
}

function diffMiddle(oldLines: string[], newLines: string[]): DiffRow[] {
    const rows: DiffRow[] = [];
    if (oldLines.length === 0) {
        return newLines.map((line) => ({ op: 'add' as DiffOp, line }));
    }
    if (newLines.length === 0) {
        return oldLines.map((line) => ({ op: 'remove' as DiffOp, line }));
    }

    if (oldLines.length * newLines.length > LCS_CELL_LIMIT) {
        // Too large for a table: report the whole block as replaced. The diff is
        // for a human to sanity-check before confirming, not for patching.
        for (const line of oldLines) rows.push({ op: 'remove', line });
        for (const line of newLines) rows.push({ op: 'add', line });
        return rows;
    }

    const rowsCount = oldLines.length;
    const colsCount = newLines.length;
    const table: number[][] = Array.from({ length: rowsCount + 1 }, () => new Array<number>(colsCount + 1).fill(0));

    for (let i = rowsCount - 1; i >= 0; i--) {
        for (let j = colsCount - 1; j >= 0; j--) {
            table[i][j] =
                oldLines[i] === newLines[j]
                    ? table[i + 1][j + 1] + 1
                    : Math.max(table[i + 1][j], table[i][j + 1]);
        }
    }

    let i = 0;
    let j = 0;
    while (i < rowsCount && j < colsCount) {
        if (oldLines[i] === newLines[j]) {
            rows.push({ op: 'same', line: oldLines[i] });
            i++;
            j++;
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            rows.push({ op: 'remove', line: oldLines[i] });
            i++;
        } else {
            rows.push({ op: 'add', line: newLines[j] });
            j++;
        }
    }
    while (i < rowsCount) rows.push({ op: 'remove', line: oldLines[i++] });
    while (j < colsCount) rows.push({ op: 'add', line: newLines[j++] });

    return rows;
}

/**
 * Render a diff for the confirmation dialog / log: unified-style markers with
 * three lines of context around each change.
 */
export function formatLineDiff(diff: LineDiff, context: number = 3): string {
    const header = '--- current Feature Studio contents\n+++ generated from the graph';

    if (diff.identical) {
        return `${header}\n(no differences)`;
    }

    const keep = new Set<number>();
    diff.rows.forEach((row, index) => {
        if (row.op === 'same') return;
        for (let offset = -context; offset <= context; offset++) {
            const target = index + offset;
            if (target >= 0 && target < diff.rows.length) keep.add(target);
        }
    });

    const body: string[] = [];
    let previousKept = -1;
    diff.rows.forEach((row, index) => {
        if (!keep.has(index)) return;
        if (previousKept < 0 && index > 0) {
            // Elided leading context: say so instead of pretending the diff starts there.
            body.push('...');
        }
        if (previousKept >= 0 && index !== previousKept + 1) {
            body.push('...');
        }
        const marker = row.op === 'add' ? '+' : row.op === 'remove' ? '-' : ' ';
        body.push(`${marker}${row.line}`);
        previousKept = index;
    });

    return [header, ...body, '', `${diff.added} line(s) added, ${diff.removed} line(s) removed`].join('\n');
}

/* ------------------------------------------------------------------ *
 * Failure description
 * ------------------------------------------------------------------ */

export interface FailureDescription {
    /** The upstream response text, verbatim, when there was one. */
    message: string;
    status?: number;
}

/**
 * Turn whatever the API layer threw into a message worth showing.
 *
 * The vendored client throws `ResponseError` for any non-2xx response; its
 * `message` is a constant string, so the useful part is the body. Over this
 * app's proxy a failed request comes back as `text/plain` containing the
 * upstream error text, which is shown as-is.
 */
export async function describeUpstreamFailure(error: unknown): Promise<FailureDescription> {
    const response = (error as { response?: { text?: () => Promise<string>; status?: number } } | undefined)
        ?.response;

    if (response != null && typeof response.text === 'function') {
        let text = '';
        try {
            text = await response.text();
        } catch {
            text = '';
        }
        const status = typeof response.status === 'number' ? response.status : undefined;
        if (typeof text === 'string' && text.length > 0) {
            return { message: text, status };
        }
        return {
            message: status === undefined ? 'Request failed with an empty response body' : `HTTP ${status} with an empty response body`,
            status,
        };
    }

    if (error instanceof Error) {
        return { message: error.message || error.name };
    }
    if (typeof error === 'string') {
        return { message: error };
    }
    try {
        return { message: JSON.stringify(error) };
    } catch {
        return { message: String(error) };
    }
}

function statusOf(error: unknown): number | undefined {
    const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
    return typeof status === 'number' ? status : undefined;
}

/* ------------------------------------------------------------------ *
 * Uploader
 * ------------------------------------------------------------------ */

export type UploadStage = 'generate' | 'target' | 'api' | 'read' | 'create' | 'write';

export type UploadOutcome =
    | { status: 'uploaded'; target: FeatureStudioTarget; contents: string; created: boolean }
    | { status: 'unchanged'; target: FeatureStudioTarget; contents: string }
    | { status: 'cancelled'; target: FeatureStudioTarget; diff: LineDiff }
    | { status: 'failed'; stage: UploadStage; message: string; httpStatus?: number };

export interface FeatureStudioUploaderOptions {
    /** `OnshapeAPI.featureStudioApi`; `undefined` before `initAPIs()` has run. */
    api: FeatureStudioApiLike | undefined;
    getTarget: () => FeatureStudioTarget | undefined;
    /** Where user-facing messages go (today: `clientMessaging.showMessageBubble`). */
    notify: (message: string) => void;
    /** Must return true before a non-empty studio is overwritten. */
    confirm: (diffText: string, diff: LineDiff) => boolean | Promise<boolean>;
    /** Name used when a missing studio is created. */
    createStudioName?: string;
}

const DEFAULT_CREATE_NAME = 'Onshape Node Editor';

/**
 * The upload flow, with every side effect injected.
 *
 * Order matters: read → diff → confirm → write. The write is the only call that
 * changes Onshape, and it is never reached on a failed read, an invalid target,
 * an unchanged payload, or a refused confirmation.
 */
export class FeatureStudioUploader {
    private readonly options: FeatureStudioUploaderOptions;

    constructor(options: FeatureStudioUploaderOptions) {
        this.options = options;
    }

    public async upload(source: string | undefined): Promise<UploadOutcome> {
        if (typeof source !== 'string') {
            return this.fail(
                'generate',
                'Nothing to upload: the graph produced no FeatureScript (is an Output node connected?).',
            );
        }

        const targetResult: TargetParseResult = validateTarget(this.options.getTarget());
        if (targetResult.ok !== true) {
            return this.fail('target', `${targetResult.error} Set one with did, wvm, wvmid and eid.`);
        }
        let target = targetResult.target;

        const api = this.options.api;
        if (api == null) {
            return this.fail('api', 'Onshape API is not initialized; upload needs a signed-in session.');
        }

        // 1. Read what is there now. A 404 means "no studio at this eid": create one.
        let current: string;
        let created = false;
        try {
            const existing = await api.getFeatureStudioContents({
                did: target.did,
                wvm: target.wvm,
                wvmid: target.wvmid,
                eid: target.eid,
            });
            current = typeof existing?.contents === 'string' ? existing.contents : '';
        } catch (error) {
            if (statusOf(error) !== 404) {
                const description = await describeUpstreamFailure(error);
                this.options.notify(description.message);
                return {
                    status: 'failed',
                    stage: 'read',
                    message: description.message,
                    httpStatus: description.status,
                };
            }

            if (target.wvm !== 'w') {
                return this.fail(
                    'create',
                    `No Feature Studio at ${target.eid}, and createFeatureStudio needs a workspace (wvm is "${target.wvm}").`,
                );
            }

            try {
                const info = await api.createFeatureStudio({
                    did: target.did,
                    wid: target.wvmid,
                    bTModelElementParams: { name: this.options.createStudioName ?? DEFAULT_CREATE_NAME },
                });
                const eid = typeof info?.id === 'string' ? info.id : undefined;
                if (eid === undefined) {
                    return this.fail('create', 'createFeatureStudio returned no element id.');
                }
                target = { ...target, eid };
                created = true;
                current = '';
            } catch (createError) {
                const description = await describeUpstreamFailure(createError);
                this.options.notify(description.message);
                return {
                    status: 'failed',
                    stage: 'create',
                    message: description.message,
                    httpStatus: description.status,
                };
            }
        }

        // 2. Nothing to do if the studio already holds exactly this.
        if (current === source) {
            const message = `Feature Studio ${target.eid} is already up to date; nothing was written.`;
            this.options.notify(message);
            return { status: 'unchanged', target, contents: source };
        }

        // 3. A non-empty studio is diffed and confirmed before being overwritten.
        if (current !== '') {
            const diff = diffLines(current, source);
            const accepted = await this.options.confirm(formatLineDiff(diff), diff);
            if (accepted !== true) {
                this.options.notify('Upload cancelled; the Feature Studio was not modified.');
                return { status: 'cancelled', target, diff };
            }
        }

        // 4. Write. `contents` is the generator's string, unmodified.
        try {
            await api.updateFeatureStudioContents(buildUpdateContentsRequest(target, source));
        } catch (error) {
            const description = await describeUpstreamFailure(error);
            this.options.notify(description.message);
            return {
                status: 'failed',
                stage: 'write',
                message: description.message,
                httpStatus: description.status,
            };
        }

        const verb = created ? 'Created and wrote' : 'Wrote';
        this.options.notify(
            `${verb} ${source.length} bytes to Feature Studio ${target.eid} (d/${target.did}/${target.wvm}/${target.wvmid}/e/${target.eid}).`,
        );
        return { status: 'uploaded', target, contents: source, created };
    }

    private fail(stage: UploadStage, message: string): UploadOutcome {
        this.options.notify(message);
        return { status: 'failed', stage, message };
    }
}
