/**
 * Issue #1 — upload the generated FeatureScript to a Feature Studio.
 *
 * This is the L2 layer: `FeatureStudioApi` is stubbed (`FeatureStudioApiLike`)
 * and the tests assert the exact request that reaches it — the four path
 * segments, the body, and that the payload is byte-identical to what the
 * generator produced. `generateFeatureStudioSource()` returns
 * `FeatureStudioGenerator.generateFeatureStudioCode(...)` unchanged, so the
 * source used here is produced by the same generator call the pipeline ends in.
 *
 * Not covered here (see the card): the real Onshape round trip (L3) and the Vue
 * toolbar wiring (L4) — `App.uploadFeatureStudio()` is a five-line delegation to
 * the `FeatureStudioUploader` exercised below.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { BTDocumentElementInfo, BTFeatureStudioContents2239, FeatureStudioApi } from 'onshape-typescript-fetch';
import { BTFeatureStudioContents2239ToJSON } from 'onshape-typescript-fetch';
import { FeatureStudioGenerator } from '../featurestudiogenerator';
import { FeatureStudioTarget } from '../featurestudiotarget';
import {
    CreateFeatureStudioRequest,
    FeatureStudioApiLike,
    FeatureStudioContentsRequest,
    FeatureStudioUploader,
    UpdateFeatureStudioContentsRequest,
    buildUpdateContentsRequest,
    describeUpstreamFailure,
    diffLines,
    formatLineDiff,
} from '../featurestudioupload';

/** The exact shape `generateFeatureStudioSource()` returns: the generator's string, untouched. */
const GENERATED = new FeatureStudioGenerator().generateFeatureStudioCode([
    { line: 'annotation { "Feature Type Name" : "My Feature" }' },
    { line: 'export const myFeature = defineFeature(function(context is Context, id is Id, definition is map)' },
    { line: '{' },
    { line: '    fCylinder(context, id + "cylinder1", {' },
    { line: '            "radius" : 1 * inch,' },
    { line: '            "height" : 2 * inch' },
    { line: '    });' },
    { line: '});' },
]);

const TARGET: FeatureStudioTarget = {
    did: 'did-0123456789abcdef',
    wvm: 'w',
    wvmid: 'ws-0123456789abcdef',
    eid: 'eid-0123456789abcdef',
};

/**
 * An error shaped like the vendored client's `ResponseError`: the response is
 * carried on `.response` and `.message` is the useless constant string, so a
 * caller that only reads `.message` loses the upstream text.
 */
function responseError(status: number, body: string) {
    return {
        name: 'ResponseError',
        message: 'Response returned an error code',
        response: {
            status,
            text: () => Promise.resolve(body),
        },
    };
}

/** The stub's mocks, kept strongly typed so `.mock.calls[n][0]` is the request object. */
type ApiMocks = {
    getFeatureStudioContents: Mock<
        (request: FeatureStudioContentsRequest) => Promise<BTFeatureStudioContents2239>
    >;
    updateFeatureStudioContents: Mock<
        (request: UpdateFeatureStudioContentsRequest) => Promise<BTFeatureStudioContents2239>
    >;
    createFeatureStudio: Mock<(request: CreateFeatureStudioRequest) => Promise<BTDocumentElementInfo>>;
};

/**
 * The `FeatureStudioApi` stub — the L2 fixture.
 *
 * Defaults describe an existing, non-empty Feature Studio; individual tests
 * override what they need. Everything the uploader touches goes through here.
 */
function makeApi(overrides: Partial<ApiMocks> = {}): ApiMocks & FeatureStudioApiLike {
    return {
        getFeatureStudioContents: vi.fn(
            async (_request: FeatureStudioContentsRequest): Promise<BTFeatureStudioContents2239> => ({
                contents: 'FeatureScript 2770;\n',
            }),
        ),
        updateFeatureStudioContents: vi.fn(
            async (_request: UpdateFeatureStudioContentsRequest): Promise<BTFeatureStudioContents2239> => ({
                contents: '',
            }),
        ),
        createFeatureStudio: vi.fn(
            async (_request: CreateFeatureStudioRequest): Promise<BTDocumentElementInfo> => ({
                id: 'eid-created',
                name: 'Onshape Node Editor',
            }),
        ),
        ...overrides,
    };
}

function makeUploader(
    api: FeatureStudioApiLike | undefined,
    options: { target?: FeatureStudioTarget; confirm?: (diffText: string, diff: ReturnType<typeof diffLines>) => boolean } = {},
) {
    const notify = vi.fn<(message: string) => void>();
    const confirm = vi.fn(options.confirm ?? (() => true));
    const uploader = new FeatureStudioUploader({
        api,
        getTarget: () => options.target,
        notify,
        confirm,
    });
    return { uploader, notify, confirm };
}

describe('buildUpdateContentsRequest', () => {
    it('addresses the studio by did/wvm/wvmid/eid, with the workspace id in the wvmid slot', () => {
        const request = buildUpdateContentsRequest(TARGET, GENERATED);

        expect(request).toEqual({
            did: 'did-0123456789abcdef',
            wvm: 'w',
            wvmid: 'ws-0123456789abcdef',
            eid: 'eid-0123456789abcdef',
            bTFeatureStudioContents2239: { contents: GENERATED },
        });
        // The trap the card warns about: wvmid is the workspace id, not the document id.
        expect(request.wvmid).not.toBe(request.did);
    });

    it('carries the generator output byte-for-byte — no trim, no BOM, no newline fix-up', () => {
        const request = buildUpdateContentsRequest(TARGET, GENERATED);
        const contents = request.bTFeatureStudioContents2239?.contents as string;

        expect(contents).toBe(GENERATED);
        expect(contents.length).toBe(GENERATED.length);
        expect(contents.charCodeAt(0)).not.toBe(0xfeff);
        expect(contents.startsWith('// Generated by Onshape Node Editor')).toBe(true);
        expect(contents.endsWith('\n')).toBe(true);
        expect(contents).toEqual(GENERATED.trim() + '\n');
    });

    it('serialises to a body whose contents is still exactly the generator output', () => {
        // The vendored client sends `BTFeatureStudioContents2239ToJSON(...)`, so
        // this is the string Onshape would receive.
        const body = BTFeatureStudioContents2239ToJSON(buildUpdateContentsRequest(TARGET, GENERATED).bTFeatureStudioContents2239);
        const wire = JSON.parse(JSON.stringify(body));

        expect(wire.contents).toBe(GENERATED);
        expect(wire.contents.charCodeAt(0)).not.toBe(0xfeff);
    });

    it('negative control: a trimmed or BOM-prefixed payload would fail those assertions', () => {
        // Guards the tests above: they are only meaningful if these differ.
        expect(GENERATED.trim()).not.toBe(GENERATED);
        expect(`\ufeff${GENERATED}`).not.toBe(GENERATED);
        expect(`${GENERATED}\n`).not.toBe(GENERATED);
    });

    it('accepts a version and a microversion segment as well as a workspace', () => {
        expect(buildUpdateContentsRequest({ ...TARGET, wvm: 'v' }, GENERATED).wvm).toBe('v');
        expect(buildUpdateContentsRequest({ ...TARGET, wvm: 'm' }, GENERATED).wvm).toBe('m');
    });

    it('is satisfied by the real vendored FeatureStudioApi (type-level)', () => {
        // Compile-time proof that `App` can pass `this.onshape.featureStudioApi`
        // straight in, without a cast or an adapter.
        type ApiIsCompatible = FeatureStudioApi extends FeatureStudioApiLike ? true : false;
        const apiIsCompatible: ApiIsCompatible = true;

        expect(apiIsCompatible).toBe(true);
    });
});

describe('FeatureStudioUploader — write path', () => {
    it('reads the studio, confirms the diff, then writes the exact payload', async () => {
        const api = makeApi({
            getFeatureStudioContents: vi.fn(async () => ({ contents: 'FeatureScript 2770;\n\noldBody();\n' })),
        });
        const { uploader, confirm, notify } = makeUploader(api, { target: TARGET });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome.status).toBe('uploaded');
        expect(api.getFeatureStudioContents).toHaveBeenCalledTimes(1);
        expect(api.getFeatureStudioContents).toHaveBeenCalledWith({
            did: TARGET.did,
            wvm: TARGET.wvm,
            wvmid: TARGET.wvmid,
            eid: TARGET.eid,
        });
        // Read before write.
        expect(api.getFeatureStudioContents.mock.invocationCallOrder[0]).toBeLessThan(
            api.updateFeatureStudioContents.mock.invocationCallOrder[0],
        );

        expect(api.updateFeatureStudioContents).toHaveBeenCalledTimes(1);
        const request = api.updateFeatureStudioContents.mock.calls[0][0];
        expect(request).toEqual(buildUpdateContentsRequest(TARGET, GENERATED));
        expect(request.bTFeatureStudioContents2239?.contents).toBe(GENERATED);

        // The diff was shown before the confirm, and the confirm was asked once.
        expect(confirm).toHaveBeenCalledTimes(1);
        const diffText = confirm.mock.calls[0][0];
        expect(diffText).toContain('-oldBody();');
        expect(diffText).toContain('+annotation { "Feature Type Name" : "My Feature" }');
        // The line-level diff is handed to the confirm alongside its rendering.
        expect(confirm.mock.calls[0][1]).toMatchObject({ identical: false });
        expect(notify).toHaveBeenCalledWith(expect.stringContaining('Wrote'));
    });

    it('writes without confirming when the studio is empty', async () => {
        const api = makeApi({ getFeatureStudioContents: vi.fn(async () => ({ contents: '' })) });
        const { uploader, confirm } = makeUploader(api, { target: TARGET });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome.status).toBe('uploaded');
        expect(confirm).not.toHaveBeenCalled();
        expect(api.updateFeatureStudioContents).toHaveBeenCalledTimes(1);
    });

    it('does not write when the confirmation is refused', async () => {
        const api = makeApi();
        const { uploader, notify } = makeUploader(api, { target: TARGET, confirm: () => false });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome.status).toBe('cancelled');
        expect(outcome.status === 'cancelled' && outcome.diff.added).toBeGreaterThan(0);
        expect(api.updateFeatureStudioContents).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Upload cancelled; the Feature Studio was not modified.');
    });
});

describe('FeatureStudioUploader — no-op and guard paths', () => {
    it('does not write when the studio already holds exactly this source', async () => {
        const api = makeApi({ getFeatureStudioContents: vi.fn(async () => ({ contents: GENERATED })) });
        const { uploader, confirm, notify } = makeUploader(api, { target: TARGET });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome.status).toBe('unchanged');
        expect(confirm).not.toHaveBeenCalled();
        expect(api.updateFeatureStudioContents).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith(expect.stringContaining('already up to date'));
    });

    it('fails without touching the API when no target is configured', async () => {
        const api = makeApi();
        const { uploader, notify } = makeUploader(api, { target: undefined });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome).toMatchObject({ status: 'failed', stage: 'target' });
        expect(outcome.status === 'failed' && outcome.message).toContain('No Feature Studio target is configured.');
        expect(api.getFeatureStudioContents).not.toHaveBeenCalled();
        expect(api.updateFeatureStudioContents).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('fails without touching the API when the graph produced no source', async () => {
        const api = makeApi();
        const { uploader } = makeUploader(api, { target: TARGET });

        const outcome = await uploader.upload(undefined);

        expect(outcome).toMatchObject({ status: 'failed', stage: 'generate' });
        expect(api.getFeatureStudioContents).not.toHaveBeenCalled();
        expect(api.updateFeatureStudioContents).not.toHaveBeenCalled();
    });

    it('fails before the first request when the API is not initialized', async () => {
        const { uploader } = makeUploader(undefined, { target: TARGET });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome).toMatchObject({ status: 'failed', stage: 'api' });
    });
});

describe('FeatureStudioUploader — failure surfaces the upstream text verbatim', () => {
    const UPSTREAM_TEXT =
        '{"message":"Cannot parse FeatureScript: line 4: syntax error at \\"fCylinder\\""}';

    it('shows the plain-text body when the write is rejected', async () => {
        const api = makeApi({
            updateFeatureStudioContents: vi.fn(async () => {
                throw responseError(400, UPSTREAM_TEXT);
            }),
        });
        const { uploader, notify } = makeUploader(api, { target: TARGET });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome.status).toBe('failed');
        expect(outcome.status === 'failed' && outcome.stage).toBe('write');
        // Verbatim: byte-identical to the proxy's text/plain body, not a summary
        // and not the vendored client's "Response returned an error code".
        expect(outcome.status === 'failed' && outcome.message).toBe(UPSTREAM_TEXT);
        expect(outcome.status === 'failed' && outcome.httpStatus).toBe(400);
        expect(notify).toHaveBeenCalledWith(UPSTREAM_TEXT);
    });

    it('shows the plain-text body when the current contents cannot be read, and writes nothing', async () => {
        const readText = 'You do not have permission to view this Feature Studio.';
        const api = makeApi({
            getFeatureStudioContents: vi.fn(async () => {
                throw responseError(403, readText);
            }),
        });
        const { uploader, notify } = makeUploader(api, { target: TARGET });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome.status === 'failed' && outcome.stage).toBe('read');
        expect(outcome.status === 'failed' && outcome.message).toBe(readText);
        expect(api.updateFeatureStudioContents).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith(readText);
    });

    it('shows the plain-text body when createFeatureStudio is rejected', async () => {
        const createText = 'A tab named "Onshape Node Editor" already exists.';
        const api = makeApi({
            getFeatureStudioContents: vi.fn(async () => {
                throw responseError(404, 'Element not found');
            }),
            createFeatureStudio: vi.fn(async () => {
                throw responseError(400, createText);
            }),
        });
        const { uploader, notify } = makeUploader(api, { target: TARGET });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome.status === 'failed' && outcome.stage).toBe('create');
        expect(outcome.status === 'failed' && outcome.message).toBe(createText);
        expect(api.updateFeatureStudioContents).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith(createText);
    });
});

describe('FeatureStudioUploader — creating a missing studio', () => {
    it('creates the studio at the target workspace, then writes into the new element', async () => {
        const api = makeApi({
            getFeatureStudioContents: vi.fn(async () => {
                throw responseError(404, 'No such element');
            }),
        });
        const { uploader } = makeUploader(api, { target: TARGET });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome.status).toBe('uploaded');
        expect(outcome.status === 'uploaded' && outcome.created).toBe(true);

        const createRequest = api.createFeatureStudio.mock.calls[0][0];
        expect(createRequest).toEqual({
            did: TARGET.did,
            // createFeatureStudio takes a workspace id, never a document id.
            wid: TARGET.wvmid,
            bTModelElementParams: { name: 'Onshape Node Editor' },
        });

        const writeRequest = api.updateFeatureStudioContents.mock.calls[0][0];
        expect(writeRequest.eid).toBe('eid-created');
        expect(writeRequest.did).toBe(TARGET.did);
        expect(writeRequest.bTFeatureStudioContents2239?.contents).toBe(GENERATED);
        // A brand-new studio is empty, so nothing was diffed or confirmed.
        expect(outcome.status === 'uploaded' && outcome.target.eid).toBe('eid-created');
    });

    it('refuses to create against a version or microversion, where there is no workspace to add a tab to', async () => {
        const api = makeApi({
            getFeatureStudioContents: vi.fn(async () => {
                throw responseError(404, 'No such element');
            }),
        });
        const { uploader } = makeUploader(api, { target: { ...TARGET, wvm: 'v' } });

        const outcome = await uploader.upload(GENERATED);

        expect(outcome).toMatchObject({ status: 'failed', stage: 'create' });
        expect(api.createFeatureStudio).not.toHaveBeenCalled();
        expect(api.updateFeatureStudioContents).not.toHaveBeenCalled();
    });
});

describe('diffLines / formatLineDiff', () => {
    it('reports identical texts without inventing changes', () => {
        const diff = diffLines(GENERATED, GENERATED);

        expect(diff.identical).toBe(true);
        expect(diff.added).toBe(0);
        expect(diff.removed).toBe(0);
    });

    it('counts an appended line as one addition and keeps the shared prefix', () => {
        const diff = diffLines('a\nb\n', 'a\nb\nc\n');

        expect(diff.identical).toBe(false);
        expect(diff.added).toBe(1);
        expect(diff.removed).toBe(0);
        expect(diff.rows.filter((row) => row.op === 'same').map((row) => row.line)).toEqual(['a', 'b']);
        expect(diff.rows.filter((row) => row.op === 'add').map((row) => row.line)).toEqual(['c']);
    });

    it('reports a changed line as a removal and an addition', () => {
        const diff = diffLines('a\nb\nc\n', 'a\nB\nc\n');

        expect(diff.added).toBe(1);
        expect(diff.removed).toBe(1);
    });

    it('is not confused by a missing trailing newline', () => {
        const diff = diffLines('a\nb', 'a\nb\n');

        expect(diff.added).toBe(0);
        expect(diff.removed).toBe(0);
        expect(diff.identical).toBe(false); // byte-wise they differ, so the upload happens
    });

    it('omits long unchanged runs from the rendered diff but keeps context', () => {
        const before = ['line0', ...Array.from({ length: 40 }, (_, index) => `same${index}`), 'old', 'tail'].join('\n');
        const after = ['line0', ...Array.from({ length: 40 }, (_, index) => `same${index}`), 'new', 'tail'].join('\n');

        const rendered = formatLineDiff(diffLines(before, after));

        expect(rendered).toContain('-old');
        expect(rendered).toContain('+new');
        expect(rendered).toContain('...');
        expect(rendered).toContain('1 line(s) added, 1 line(s) removed');
        // 3 lines of context either side, so the middle of the unchanged run is elided.
        expect(rendered).not.toContain('same10');
    });

    it('handles a first-upload diff against an empty studio', () => {
        const rendered = formatLineDiff(diffLines('', GENERATED));

        expect(rendered).toContain('+FeatureScript');
        expect(rendered).toContain(`${GENERATED.split('\n').length - 1} line(s) added, 0 line(s) removed`);
    });
});

describe('describeUpstreamFailure', () => {
    it('prefers the response body over the client library message', async () => {
        const description = await describeUpstreamFailure(responseError(400, 'plain text from the proxy'));

        expect(description).toEqual({ message: 'plain text from the proxy', status: 400 });
    });

    it('falls back to the status when the body is empty', async () => {
        const description = await describeUpstreamFailure(responseError(500, ''));

        expect(description).toEqual({ message: 'HTTP 500 with an empty response body', status: 500 });
    });

    it('falls back to an Error message, a string, or a JSON dump', async () => {
        expect((await describeUpstreamFailure(new Error('boom'))).message).toBe('boom');
        expect((await describeUpstreamFailure('thrown string')).message).toBe('thrown string');
        expect((await describeUpstreamFailure({ code: 42 })).message).toBe('{"code":42}');
    });
});
