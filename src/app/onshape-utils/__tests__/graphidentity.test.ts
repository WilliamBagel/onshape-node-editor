/**
 * Issue #31 — graph identity resolution (L1).
 *
 * Covers the pure `resolveGraphTarget`: exact match, no match (first open),
 * two elements claiming one graph, and a renamed studio. The create flow is
 * exercised against stub APIs (confirmation, element creation, failure path).
 * No real document is simulated; the L3 round trip is out of scope here.
 */

import { describe, expect, it, vi } from 'vitest';
import type { BTDocumentElementInfo } from 'onshape-typescript-fetch';
import {
    GraphIdentityService,
    createGraphIdentity,
    graphElementNameFor,
    resolveGraphTarget,
    type GraphIdentity,
    type GraphIdentityApis,
} from '../graphidentity';

const CONTEXT = { did: 'did-0123456789abcdef', workspaceId: 'ws-0123456789abcdef' };

const IDENTITY: GraphIdentity = createGraphIdentity('My Graph', 'studio-1', 'graph-el-1');

function studio(id: string, name = 'My Graph'): BTDocumentElementInfo {
    return { id, name, elementType: 'FEATURESTUDIO' };
}

function graphElement(id: string, name = graphElementNameFor('My Graph')): BTDocumentElementInfo {
    return { id, name, elementType: 'APPLICATION' };
}

describe('resolveGraphTarget', () => {
    it('exact match: recorded ids resolve to the document target', () => {
        const result = resolveGraphTarget([studio('studio-1'), graphElement('graph-el-1')], IDENTITY, CONTEXT);
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;
        expect(result.studio.id).toBe('studio-1');
        expect(result.graphElement.id).toBe('graph-el-1');
        expect(result.target).toEqual({
            did: CONTEXT.did,
            wvm: 'w',
            wvmid: CONTEXT.workspaceId,
            eid: 'studio-1',
        });
    });

    it('no match: nothing in the document claims the graph (first open)', () => {
        const result = resolveGraphTarget(
            [studio('other-studio', 'Something else'), { id: 'ps-1', name: 'Part', elementType: 'PARTSTUDIO' }],
            IDENTITY,
            CONTEXT,
        );
        expect(result.status).toBe('none');
    });

    it('two matches: two elements claiming one graph is drift and blocks', () => {
        const result = resolveGraphTarget(
            [studio('studio-1'), graphElement('graph-el-1'), graphElement('graph-el-2')],
            IDENTITY,
            CONTEXT,
        );
        expect(result.status).toBe('drift');
        if (result.status !== 'drift') return;
        expect(result.issues.map((i) => i.kind)).toEqual(['duplicate-graph-element']);
        expect(result.issues[0].severity).toBe('error');
    });

    it('renamed studio: matching is by recorded id, never by name', () => {
        const result = resolveGraphTarget(
            [studio('studio-1', 'Totally Renamed Studio'), graphElement('graph-el-1')],
            IDENTITY,
            CONTEXT,
        );
        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;
        expect(result.target.eid).toBe('studio-1');
    });

    it('studio missing while the graph element exists is drift', () => {
        const result = resolveGraphTarget([graphElement('graph-el-1')], IDENTITY, CONTEXT);
        expect(result.status).toBe('drift');
        if (result.status !== 'drift') return;
        expect(result.issues.map((i) => i.kind)).toEqual(['studio-missing']);
    });

    it('graph element missing while the studio exists is drift', () => {
        const result = resolveGraphTarget([studio('studio-1')], IDENTITY, CONTEXT);
        expect(result.status).toBe('drift');
        if (result.status !== 'drift') return;
        expect(result.issues.map((i) => i.kind)).toEqual(['graph-element-missing']);
    });
});

describe('GraphIdentityService create flow', () => {
    function service(overrides: {
        elements?: BTDocumentElementInfo[];
        confirm?: (message: string) => boolean | Promise<boolean>;
        createFeatureStudio?: GraphIdentityApis['featureStudioApi']['createFeatureStudio'];
        createGraphElement?: GraphIdentityApis['createGraphElement'];
    } = {}) {
        const report = vi.fn();
        const createFeatureStudio = vi.fn(async (req: Parameters<GraphIdentityApis['featureStudioApi']['createFeatureStudio']>[0]) =>
            overrides.createFeatureStudio != null ? overrides.createFeatureStudio(req) : studio('studio-new'),
        );
        const createGraphElement = vi.fn(async (name: string) =>
            overrides.createGraphElement != null ? overrides.createGraphElement(name) : 'graph-el-new',
        );
        const persistGraph = vi.fn(async () => undefined);
        const svc = new GraphIdentityService({
            apis: {
                documentApi: {
                    getElementsInDocument: vi.fn(async () => overrides.elements ?? []),
                },
                featureStudioApi: { createFeatureStudio },
                createGraphElement,
                persistGraph,
            },
            context: CONTEXT,
            confirm: overrides.confirm ?? (() => true),
            report,
            getSerializedGraph: () => '{"nodes":[]}',
        });
        return { svc, report, createFeatureStudio, createGraphElement, persistGraph };
    }

    it('first open: confirm, then one studio + one graph element, graph persisted', async () => {
        const { svc, createFeatureStudio, createGraphElement, persistGraph } = service();
        const outcome = await svc.ensureGraph(undefined, 'My Graph');
        expect(outcome.status).toBe('created');
        if (outcome.status !== 'created') return;
        expect(outcome.identity).toEqual({
            graphName: 'My Graph',
            featureStudioElementId: 'studio-new',
            graphElementId: 'graph-el-new',
            graphElementName: 'My Graph graph',
        });
        expect(outcome.target.eid).toBe('studio-new');
        expect(createFeatureStudio).toHaveBeenCalledWith(
            expect.objectContaining({ did: CONTEXT.did, wid: CONTEXT.workspaceId }),
        );
        expect(createFeatureStudio.mock.calls[0][0].bTModelElementParams.name).toBe('My Graph');
        expect(createGraphElement).toHaveBeenCalledWith('My Graph graph');
        expect(persistGraph).toHaveBeenCalledWith('graph-el-new', '{"nodes":[]}');
    });

    it('refused confirmation creates nothing', async () => {
        const { svc, createFeatureStudio, createGraphElement, report } = service({
            confirm: () => false,
        });
        const outcome = await svc.ensureGraph(undefined, 'My Graph');
        expect(outcome.status).toBe('declined');
        expect(createFeatureStudio).not.toHaveBeenCalled();
        expect(createGraphElement).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith('info', expect.stringContaining('Cancelled'), 'editor');
    });

    it('studio creation failure is reported and stops before the graph element', async () => {
        const { svc, createGraphElement, report } = service({
            createFeatureStudio: vi.fn(async () => {
                throw new Error('upstream 403');
            }),
        });
        const outcome = await svc.ensureGraph(undefined, 'My Graph');
        expect(outcome.status).toBe('failed');
        expect(createGraphElement).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith('error', expect.any(String), 'editor');
    });

    it('drift on an existing identity blocks and reports as errors', async () => {
        const { svc, createFeatureStudio, report } = service({
            elements: [studio('studio-1'), graphElement('graph-el-1'), graphElement('graph-el-2')],
        });
        const outcome = await svc.ensureGraph(IDENTITY, 'My Graph');
        expect(outcome.status).toBe('drift');
        expect(createFeatureStudio).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith('error', expect.stringContaining('claim'), 'upload');
    });

    it('an additional graph (`+`) gets its own studio and element', async () => {
        const { svc } = service({
            createFeatureStudio: vi.fn(async () => studio('studio-second')),
            createGraphElement: vi.fn(async () => 'graph-el-second'),
        });
        const outcome = await svc.createAdditionalGraph('Second Graph');
        expect(outcome.status).toBe('created');
        if (outcome.status !== 'created') return;
        expect(outcome.identity.featureStudioElementId).toBe('studio-second');
        expect(outcome.identity.graphElementId).toBe('graph-el-second');
        expect(outcome.identity.graphName).toBe('Second Graph');
    });
});
