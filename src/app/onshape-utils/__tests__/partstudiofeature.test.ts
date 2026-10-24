/**
 * Issue #2 — insert the generated feature into a Part Studio.
 *
 * This is the L2 layer: `PartStudioApi` and `FeatureStudioApi` are stubbed
 * (`PartStudioApiLike` / `FeatureStudioSpecsApiLike`) and the tests assert the
 * exact request that reaches `addPartStudioFeature` — the four consumer path
 * segments, the namespace that came from the *defining* Feature Studio, the
 * feature type, every mapped `BTMParameter*`, and the failure paths (rejection
 * with line/column, featureState ERROR with cleanup, microversion skew, and an
 * unmapped parameter).
 *
 * Not covered here (see the card): the real Onshape round trip (L3) and the
 * toolbar wiring (L4) — `App.insertPartStudioFeature()` is a five-line
 * delegation to `PartStudioFeatureInserter` exercised below.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type {
    AddPartStudioFeatureRequest,
    BTFeatureDefinitionResponse1617,
    BTFeatureSpecsResponse664,
} from 'onshape-typescript-fetch';
import { BTFeatureDefinitionCall1406ToJSON } from 'onshape-typescript-fetch';
import {
    FeatureInsertion,
    FeatureStudioSpecsApiLike,
    PartStudioApiLike,
    PartStudioFeatureInserter,
    PartStudioTarget,
    PartStudioTargetSettings,
    UnmappedParameterError,
    buildAddFeatureRequest,
    defaultParameterValue,
    formatProblemLocation,
    localFeatureNamespace,
    mapParameters,
    parseFeatureNamespace,
    parseFeatureScriptProblems,
    parameterTypeForSpec,
} from '../partstudiofeature';
import { FeatureStudioTarget, MemoryStorage, FeatureStudioTargetSettings } from '../featurestudiotarget';
import { describeGeneratedFeature } from '../../rete/graph-codegen';
import { DefineFeatureNode } from '../../rete/nodes/definefeaturenode';
import type { OnshapeNode } from '../../rete/nodes/onshapenode';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/** The defining element: the Feature Studio #1 wrote the generated source to. */
const DEFINING: FeatureStudioTarget = {
    did: 'doc-0123456789abcdef012345',
    wvm: 'w',
    wvmid: 'ws-0123456789abcdef0123',
    eid: 'studio-eid-0123456789ab',
};

/** The consumer: the Part Studio the feature is inserted into (same document). */
const CONSUMER: PartStudioTarget = {
    did: 'doc-0123456789abcdef012345',
    wvm: 'w',
    wvmid: 'ws-0123456789abcdef0123',
    eid: 'partstudio-eid-98765432',
};

const STUDIO_MICROVERSION = 'b47f14f24a7f43d8495cb724';
const STUDIO_NAMESPACE = `e${DEFINING.eid}::m${STUDIO_MICROVERSION}`;

const INSERTION: FeatureInsertion = {
    featureType: 'myNewFeature',
    featureName: 'My New Feature',
    parameters: {
        // One of every control type that exists today.
        doTheThing: { type: 'Boolean', value: true } as never,
        myParameter: { type: 'String', value: 'hello' },
        size: { type: 'ValueWithUnits', value: { value: 1, units: 'inch' } } as never,
        entities: { type: 'QueryList', value: { type: 'Query', nodeId: 'node-1', queries: [] } } as never,
        chamferType: {
            type: 'Enum',
            value: 'TWO_OFFSETS',
            enumName: 'ChamferType',
        } as never,
        referenceId: { type: 'Id', value: '_0' },
    },
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

type PartStudioMocks = {
    addPartStudioFeature: Mock<(request: AddPartStudioFeatureRequest) => Promise<BTFeatureDefinitionResponse1617>>;
    deletePartStudioFeature: Mock<(request: { did: string; wid: string; eid: string; fid: string }) => Promise<unknown>>;
};

function makePartStudioApi(overrides: Partial<PartStudioMocks> = {}): PartStudioMocks & PartStudioApiLike {
    return {
        addPartStudioFeature: vi.fn(
            async (_request: AddPartStudioFeatureRequest): Promise<BTFeatureDefinitionResponse1617> => ({
                btType: 'BTFeatureDefinitionResponse-1617',
                feature: { btType: 'BTMFeature-134', featureId: 'feature-1' },
                featureState: { btType: 'BTFeatureState-1688', featureStatus: 'OK' },
                microversionSkew: false,
            }),
        ),
        deletePartStudioFeature: vi.fn(async () => ({})),
        ...overrides,
    };
}

type SpecsMocks = {
    getFeatureStudioSpecs: Mock<(request: { did: string; wvm: string; wvmid: string; eid: string }) => Promise<BTFeatureSpecsResponse664>>;
};

function makeSpecsApi(overrides: Partial<SpecsMocks> = {}): SpecsMocks & FeatureStudioSpecsApiLike {
    return {
        getFeatureStudioSpecs: vi.fn(async () => ({
            btType: 'BTFeatureSpecsResponse-664',
            featureSpecs: [
                { btType: 'BTFeatureSpec-129', featureType: 'myNewFeature', namespace: STUDIO_NAMESPACE },
            ],
            microversionSkew: false,
        })),
        ...overrides,
    };
}

function makeInserter(options: {
    partStudioApi?: PartStudioApiLike;
    featureStudioApi?: FeatureStudioSpecsApiLike;
    defining?: FeatureStudioTarget;
    consumer?: PartStudioTarget;
} = {}) {
    const messages: string[] = [];
    const inserter = new PartStudioFeatureInserter({
        partStudioApi: 'partStudioApi' in options ? options.partStudioApi : makePartStudioApi(),
        featureStudioApi: 'featureStudioApi' in options ? options.featureStudioApi : makeSpecsApi(),
        getDefiningTarget: () => ('defining' in options ? options.defining : DEFINING),
        getConsumerTarget: () => ('consumer' in options ? options.consumer : CONSUMER),
        notify: (message) => messages.push(message),
    });
    return { inserter, messages };
}

/* ------------------------------------------------------------------ *
 * Namespace
 * ------------------------------------------------------------------ */

describe('feature namespace', () => {
    it('is the local e<elementId>::m<microversion> form', () => {
        expect(localFeatureNamespace(DEFINING, STUDIO_MICROVERSION)).toBe(STUDIO_NAMESPACE);
        expect(parseFeatureNamespace(STUDIO_NAMESPACE)).toEqual({
            eid: DEFINING.eid,
            microversion: STUDIO_MICROVERSION,
        });
    });

    it('refuses to build one without an element id or microversion', () => {
        expect(() => localFeatureNamespace({ ...DEFINING, eid: '  ' }, STUDIO_MICROVERSION)).toThrow(/element id/);
        expect(() => localFeatureNamespace(DEFINING, '')).toThrow(/microversion/);
    });

    it('does not parse the std-library empty namespace, or anything else', () => {
        expect(parseFeatureNamespace('')).toBeUndefined();
        expect(parseFeatureNamespace('eabc::v1')).toBeUndefined();
        expect(parseFeatureNamespace(undefined)).toBeUndefined();
    });
});

/* ------------------------------------------------------------------ *
 * Target
 * ------------------------------------------------------------------ */

describe('PartStudioTarget', () => {
    it('reuses the Feature Studio target validation, in a separate storage key', () => {
        const storage = new MemoryStorage();
        const partStudio = new PartStudioTargetSettings(storage);
        const featureStudio = new FeatureStudioTargetSettings(storage);

        expect(partStudio.set('did=doc-1,wvm=w,wvmid=ws-1,eid=ps-1')).toEqual({
            did: 'doc-1',
            wvm: 'w',
            wvmid: 'ws-1',
            eid: 'ps-1',
        });
        // Setting the Part Studio target must not change the Feature Studio one.
        expect(featureStudio.get()).toBeUndefined();
        expect(partStudio.get()?.eid).toBe('ps-1');
    });

    it('rejects a bad wvm segment through the shared parser', () => {
        const settings = new PartStudioTargetSettings(new MemoryStorage());
        expect(() => settings.set('did=d,wvm=x,wvmid=w,eid=e')).toThrow(/wvm must be one of w, v or m/);
    });
});

/* ------------------------------------------------------------------ *
 * Parameter mapping
 * ------------------------------------------------------------------ */

describe('parameter mapping', () => {
    it('maps each control type that exists today to its BTMParameter object', () => {
        expect(mapParameters(INSERTION.parameters)).toEqual([
            {
                btType: 'BTMParameterEnum-145',
                parameterId: 'chamferType',
                value: 'TWO_OFFSETS',
                enumName: 'ChamferType',
            },
            { btType: 'BTMParameterBoolean-144', parameterId: 'doTheThing', value: true },
            { btType: 'BTMParameterQueryList-148', parameterId: 'entities', queries: [], nodeId: 'node-1' },
            { btType: 'BTMParameterString-149', parameterId: 'myParameter', value: 'hello' },
            { btType: 'BTMParameterString-149', parameterId: 'referenceId', value: '_0' },
            {
                btType: 'BTMParameterQuantity-147',
                parameterId: 'size',
                value: 1,
                units: 'inch',
                expression: '1 inch',
            },
        ]);
    });

    it('names the parameter id when a type has no mapping, instead of inserting a half-specified feature', () => {
        const attempt = () => mapParameters({ selection: { type: 'Selection', value: [] } as never });
        expect(attempt).toThrow(UnmappedParameterError);
        try {
            attempt();
        } catch (error) {
            expect((error as Error).message).toContain('"selection"');
            expect((error as Error).message).toContain('Selection');
        }
    });

    it('refuses a Context parameter, which is supplied by the caller in the Part Studio', () => {
        expect(() => mapParameters({ context: { type: 'Context', value: 'Context' } })).toThrow(/"context"/);
    });

    it('wraps a bare query string as BTMIndividualQuery-138 and passes a JSON query through', () => {
        const [parameter] = mapParameters({
            entities: {
                type: 'QueryList',
                value: {
                    type: 'Query',
                    nodeId: 'n',
                    queries: ['query = qCreatedBy(id + "extrude1");', '{"btType":"BTMIndividualQuery-138","queryString":"q"}'],
                },
            } as never,
        }) as Array<{ queries: unknown[] }>;
        expect(parameter.queries).toEqual([
            { btType: 'BTMIndividualQuery-138', queryString: 'query = qCreatedBy(id + "extrude1");' },
            { btType: 'BTMIndividualQuery-138', queryString: 'q' },
        ]);
    });

    it('maps the spec btTypes a defineFeature precondition declares', () => {
        expect(parameterTypeForSpec('BTParameterSpecBoolean-170')).toBe('Boolean');
        expect(parameterTypeForSpec('BTParameterSpecString-175')).toBe('String');
        expect(parameterTypeForSpec('BTParameterSpecQuantity-173')).toBe('ValueWithUnits');
        expect(parameterTypeForSpec('BTParameterSpecQuery-174')).toBe('QueryList');
        expect(parameterTypeForSpec('BTParameterSpecEnum-171')).toBe('Enum');
        expect(parameterTypeForSpec('BTParameterSpecArray-2600')).toBeUndefined();

        expect(defaultParameterValue('Boolean')).toEqual({ type: 'Boolean', value: false });
        expect(defaultParameterValue('QueryList')).toEqual({
            type: 'QueryList',
            value: { type: 'Query', nodeId: '', queries: [] },
        });
        // An enum's legal values are not in a precondition, so no default is invented.
        expect(defaultParameterValue('Enum')).toBeUndefined();
    });
});

/* ------------------------------------------------------------------ *
 * Request shape
 * ------------------------------------------------------------------ */

describe('buildAddFeatureRequest', () => {
    it('addresses the Part Studio but names the Feature Studio in the namespace', () => {
        const request = buildAddFeatureRequest(CONSUMER, STUDIO_NAMESPACE, INSERTION);

        // Path segments come from the *consumer* ...
        expect(request.did).toBe(CONSUMER.did);
        expect(request.wvm).toBe(CONSUMER.wvm);
        expect(request.wvmid).toBe(CONSUMER.wvmid);
        expect(request.eid).toBe(CONSUMER.eid);

        const feature = request.bTFeatureDefinitionCall1406?.feature;
        // ... while namespace and featureType come from the *defining* element.
        expect(feature?.namespace).toBe(STUDIO_NAMESPACE);
        expect(feature?.featureType).toBe('myNewFeature');
        expect(feature?.name).toBe('My New Feature');
        // The trap from the issue: the consumer's element id must not leak in.
        expect(feature?.namespace).not.toContain(CONSUMER.eid);

        // Skew is refused, never best-effort reinterpreted.
        expect(request.bTFeatureDefinitionCall1406?.rejectMicroversionSkew).toBe(true);
        expect(request.bTFeatureDefinitionCall1406?.btType).toBe('BTFeatureDefinitionCall-1406');
        expect(feature?.btType).toBe('BTMFeature-134');
    });
});

/* ------------------------------------------------------------------ *
 * Insertion (L2)
 * ------------------------------------------------------------------ */

describe('PartStudioFeatureInserter', () => {
    it('inserts the feature and sends the exact payload', async () => {
        const api = makePartStudioApi();
        const specs = makeSpecsApi();
        const { inserter, messages } = makeInserter({ partStudioApi: api, featureStudioApi: specs });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('inserted');
        expect(api.addPartStudioFeature).toHaveBeenCalledTimes(1);
        expect(specs.getFeatureStudioSpecs).toHaveBeenCalledTimes(1);
        expect(specs.getFeatureStudioSpecs.mock.calls[0][0]).toEqual({
            did: DEFINING.did,
            wvm: DEFINING.wvm,
            wvmid: DEFINING.wvmid,
            eid: DEFINING.eid,
        });

        if (outcome.status !== 'inserted') throw new Error('expected inserted');
        expect(outcome.featureId).toBe('feature-1');
        expect(outcome.namespace).toBe(STUDIO_NAMESPACE);
        expect(messages.join('\n')).toContain('Inserted My New Feature');

        // The full request, once, so the shape is reviewable.
        const request = api.addPartStudioFeature.mock.calls[0][0];
        // eslint-disable-next-line no-console
        console.log('addPartStudioFeature payload:\n' + JSON.stringify(request, null, 2));

        expect(request).toEqual({
            did: CONSUMER.did,
            wvm: CONSUMER.wvm,
            wvmid: CONSUMER.wvmid,
            eid: CONSUMER.eid,
            bTFeatureDefinitionCall1406: {
                btType: 'BTFeatureDefinitionCall-1406',
                rejectMicroversionSkew: true,
                feature: {
                    btType: 'BTMFeature-134',
                    featureType: 'myNewFeature',
                    name: 'My New Feature',
                    namespace: STUDIO_NAMESPACE,
                    parameters: [
                        {
                            btType: 'BTMParameterEnum-145',
                            parameterId: 'chamferType',
                            value: 'TWO_OFFSETS',
                            enumName: 'ChamferType',
                        },
                        { btType: 'BTMParameterBoolean-144', parameterId: 'doTheThing', value: true },
                        { btType: 'BTMParameterQueryList-148', parameterId: 'entities', queries: [], nodeId: 'node-1' },
                        { btType: 'BTMParameterString-149', parameterId: 'myParameter', value: 'hello' },
                        { btType: 'BTMParameterString-149', parameterId: 'referenceId', value: '_0' },
                        {
                            btType: 'BTMParameterQuantity-147',
                            parameterId: 'size',
                            value: 1,
                            units: 'inch',
                            expression: '1 inch',
                        },
                    ],
                    returnAfterSubfeatures: false,
                    suppressed: false,
                },
            },
        });

        // The serializer keeps the discriminator, i.e. what goes on the wire is
        // the same JSON the assertion above pins.
        expect(BTFeatureDefinitionCall1406ToJSON(request.bTFeatureDefinitionCall1406)['feature']['btType']).toBe(
            'BTMFeature-134',
        );
    });

    it('takes the namespace from a microversion-pinned target without a specs call', async () => {
        const api = makePartStudioApi();
        const specs = makeSpecsApi();
        const { inserter } = makeInserter({
            partStudioApi: api,
            featureStudioApi: specs,
            defining: { ...DEFINING, wvm: 'm', wvmid: STUDIO_MICROVERSION },
        });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('inserted');
        expect(specs.getFeatureStudioSpecs).not.toHaveBeenCalled();
        expect(api.addPartStudioFeature.mock.calls[0][0].bTFeatureDefinitionCall1406?.feature?.namespace).toBe(
            STUDIO_NAMESPACE,
        );
    });

    it('reports a FeatureScript error with line and column and inserts nothing else', async () => {
        const api = makePartStudioApi({
            addPartStudioFeature: vi.fn(async () => {
                throw responseError(
                    400,
                    'FeatureScript error: Parameter size: cannot convert 0 to a length. line 12 column 4',
                );
            }),
        });
        const { inserter, messages } = makeInserter({ partStudioApi: api });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('rejected');
        expect(api.addPartStudioFeature).toHaveBeenCalledTimes(1); // one POST, no retry
        expect(api.deletePartStudioFeature).not.toHaveBeenCalled();

        if (outcome.status !== 'rejected') throw new Error('expected rejected');
        expect(outcome.problems).toHaveLength(1);
        expect(outcome.problems[0]).toMatchObject({ line: 12, column: 4 });
        expect(outcome.problems[0].message).toContain('FeatureScript error');
        expect(outcome.featureId).toBeUndefined(); // no feature was created
        expect(outcome.removed).toBe(false);
        expect(formatProblemLocation(outcome.problems[0])).toBe('line 12, column 4');
        expect(messages.join('\n')).toContain('line 12, column 4'); // surfaced to the user
    });

    it('reports an upstream failure without a location verbatim', async () => {
        const api = makePartStudioApi({
            addPartStudioFeature: vi.fn(async () => {
                throw responseError(400, 'Cannot resolve feature spec myNewFeature');
            }),
        });
        const { inserter, messages } = makeInserter({ partStudioApi: api });

        const outcome = await inserter.insert(INSERTION);

        if (outcome.status !== 'rejected') throw new Error('expected rejected');
        expect(outcome.problems[0]).toEqual({ message: 'Cannot resolve feature spec myNewFeature' });
        expect(messages.join('\n')).toContain('Cannot resolve feature spec myNewFeature');
    });

    it('deletes a feature that Onshape accepted but marked ERROR', async () => {
        const api = makePartStudioApi({
            addPartStudioFeature: vi.fn(async () => ({
                btType: 'BTFeatureDefinitionResponse-1617',
                feature: { btType: 'BTMFeature-134', featureId: 'broken-1' },
                featureState: { btType: 'BTFeatureState-1688', featureStatus: 'ERROR' },
            })),
        });
        const { inserter, messages } = makeInserter({ partStudioApi: api });

        const outcome = await inserter.insert(INSERTION);

        expect(api.deletePartStudioFeature).toHaveBeenCalledTimes(1);
        expect(api.deletePartStudioFeature.mock.calls[0][0]).toEqual({
            did: CONSUMER.did,
            wid: CONSUMER.wvmid,
            eid: CONSUMER.eid,
            fid: 'broken-1',
        });

        if (outcome.status !== 'rejected') throw new Error('expected rejected');
        expect(outcome.featureId).toBe('broken-1');
        expect(outcome.removed).toBe(true);
        expect(messages.join('\n')).toContain('was deleted again');
    });

    it('says plainly when a rejected feature could not be deleted (no delete API available)', async () => {
        const api: PartStudioApiLike = {
            addPartStudioFeature: vi.fn(async (): Promise<BTFeatureDefinitionResponse1617> => ({
                btType: 'BTFeatureDefinitionResponse-1617',
                feature: { btType: 'BTMFeature-134', featureId: 'broken-2' },
                featureState: { btType: 'BTFeatureState-1688', featureStatus: 'ERROR' },
            })),
        };
        const { inserter, messages } = makeInserter({ partStudioApi: api });

        const outcome = await inserter.insert(INSERTION);

        if (outcome.status !== 'rejected') throw new Error('expected rejected');
        expect(outcome.removed).toBe(false);
        expect(messages.join('\n')).toContain('could NOT be deleted');
    });

    it('surfaces microversion skew and does not retry', async () => {
        const api = makePartStudioApi({
            addPartStudioFeature: vi.fn(async () => ({
                btType: 'BTFeatureDefinitionResponse-1617',
                microversionSkew: true,
                sourceMicroversion: 'aaaa1111bbbb2222cccc',
            })),
        });
        const { inserter, messages } = makeInserter({ partStudioApi: api });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('skew');
        expect(api.addPartStudioFeature).toHaveBeenCalledTimes(1);
        if (outcome.status !== 'skew') throw new Error('expected skew');
        expect(outcome.skew).toEqual({
            microversionSkew: true,
            sourceMicroversion: 'aaaa1111bbbb2222cccc',
            namespaceMicroversion: STUDIO_MICROVERSION,
        });
        expect(messages.join('\n')).toContain('microversion skew');
        expect(messages.join('\n')).toContain('Nothing was retried');
    });

    it('reports skew from the specs call and inserts nothing', async () => {
        const api = makePartStudioApi();
        const specs = makeSpecsApi({
            getFeatureStudioSpecs: vi.fn(async () => ({
                btType: 'BTFeatureSpecsResponse-664',
                featureSpecs: [],
                microversionSkew: true,
                sourceMicroversion: 'stale-microversion',
            })),
        });
        const { inserter } = makeInserter({ partStudioApi: api, featureStudioApi: specs });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('skew');
        expect(api.addPartStudioFeature).not.toHaveBeenCalled();
    });

    it('fails loudly, naming the feature type, when the studio does not define it', async () => {
        const api = makePartStudioApi();
        const specs = makeSpecsApi({
            getFeatureStudioSpecs: vi.fn(async () => ({
                btType: 'BTFeatureSpecsResponse-664',
                featureSpecs: [{ btType: 'BTFeatureSpec-129', featureType: 'somethingElse', namespace: 'e1::m2' }],
            })),
        });
        const { inserter, messages } = makeInserter({ partStudioApi: api, featureStudioApi: specs });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('failed');
        if (outcome.status !== 'failed') throw new Error('expected failed');
        expect(outcome.stage).toBe('namespace');
        expect(outcome.message).toContain('myNewFeature');
        expect(outcome.message).toContain('somethingElse');
        expect(messages.join('\n')).toContain('Run Upload first');
        expect(api.addPartStudioFeature).not.toHaveBeenCalled();
    });

    it('refuses a cross-document defining element instead of guessing a namespace', async () => {
        const api = makePartStudioApi();
        const specs = makeSpecsApi();
        const { inserter } = makeInserter({
            partStudioApi: api,
            featureStudioApi: specs,
            defining: { ...DEFINING, did: 'other-document' },
        });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('failed');
        if (outcome.status !== 'failed') throw new Error('expected failed');
        expect(outcome.stage).toBe('namespace');
        expect(outcome.message).toContain('different documents');
        expect(api.addPartStudioFeature).not.toHaveBeenCalled();
        expect(specs.getFeatureStudioSpecs).not.toHaveBeenCalled();
    });

    it('fails with the parameter id when a value has no mapping, before calling Onshape', async () => {
        const api = makePartStudioApi();
        const { inserter, messages } = makeInserter({ partStudioApi: api });

        const outcome = await inserter.insert({
            ...INSERTION,
            parameters: { ...INSERTION.parameters, entities: { type: 'Selection', value: [] } as never },
        });

        expect(outcome.status).toBe('failed');
        if (outcome.status !== 'failed') throw new Error('expected failed');
        expect(outcome.stage).toBe('parameters');
        expect(outcome.message).toContain('"entities"');
        expect(api.addPartStudioFeature).not.toHaveBeenCalled();
        expect(messages.join('\n')).toContain('"entities"');
    });

    it('fails before anything when the Part Studio target is unset or invalid', async () => {
        const api = makePartStudioApi();
        const { inserter } = makeInserter({ partStudioApi: api, consumer: undefined });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('failed');
        if (outcome.status !== 'failed') throw new Error('expected failed');
        expect(outcome.stage).toBe('target');
        expect(api.addPartStudioFeature).not.toHaveBeenCalled();
    });

    it('refuses a version/microversion Part Studio target, which cannot take a write', async () => {
        const api = makePartStudioApi();
        const { inserter } = makeInserter({
            partStudioApi: api,
            consumer: { ...CONSUMER, wvm: 'v', wvmid: 'version-1' },
        });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('failed');
        if (outcome.status !== 'failed') throw new Error('expected failed');
        expect(outcome.stage).toBe('target');
        expect(outcome.message).toContain('immutable');
        expect(api.addPartStudioFeature).not.toHaveBeenCalled();
    });

    it('fails when the Onshape API is not initialized', async () => {
        const { inserter, messages } = makeInserter({
            partStudioApi: undefined,
            featureStudioApi: undefined,
            defining: { ...DEFINING, wvm: 'm', wvmid: STUDIO_MICROVERSION },
        });

        const outcome = await inserter.insert(INSERTION);

        expect(outcome.status).toBe('failed');
        if (outcome.status !== 'failed') throw new Error('expected failed');
        expect(outcome.stage).toBe('api');
        expect(messages.join('\n')).toContain('not initialized');
    });
});

/* ------------------------------------------------------------------ *
 * Diagnostics parsing
 * ------------------------------------------------------------------ */

describe('parseFeatureScriptProblems', () => {
    it('reads line/column out of a plain-text body', () => {
        expect(parseFeatureScriptProblems('Sketch error at line 3, column 7.')).toEqual([
            { message: 'Sketch error at line 3, column 7.', line: 3, column: 7 },
        ]);
    });

    it('reads a JSON body with a nested errors array', () => {
        const body = JSON.stringify({
            message: 'One or more parameters are invalid',
            errors: [{ message: 'cannot convert', location: { line: 9, column: 2 } }],
        });
        expect(parseFeatureScriptProblems(body)).toEqual([
            { message: 'cannot convert', line: 9, column: 2 },
        ]);
    });

    it('returns nothing for an empty body', () => {
        expect(parseFeatureScriptProblems('')).toEqual([]);
        expect(parseFeatureScriptProblems('   ')).toEqual([]);
    });
});

/* ------------------------------------------------------------------ *
 * Graph → insertion description
 * ------------------------------------------------------------ */

function defineNode(name: string, preconditions: Array<{ name: string; btType: string }>): DefineFeatureNode {
    return new DefineFeatureNode({
        annotation: { type: 'Feature Type Name', value: name },
        preconditions: preconditions.map((precondition) => ({
            annotation: { type: 'Property Function Name', value: precondition.name },
            btType: precondition.btType,
        })),
    });
}

describe('describeGeneratedFeature', () => {
    it('derives featureType from the Define Feature title and one parameter per precondition', () => {
        const node = defineNode('My New Feature', [
            { name: 'my parameter', btType: 'BTParameterSpecString-175' },
            { name: 'do the thing', btType: 'BTParameterSpecBoolean-170' },
            { name: 'edges', btType: 'BTParameterSpecQuery-174' },
            { name: 'size', btType: 'BTParameterSpecQuantity-173' },
        ]);

        const description = describeGeneratedFeature([node as unknown as OnshapeNode]);

        expect(description).toEqual({
            ok: true,
            featureType: 'myNewFeature',
            featureName: 'My New Feature',
            parameters: {
                // Whitespace is stripped: the generated source declares
                // `definition.myparameter`, so that is the parameter id.
                myparameter: { type: 'String', value: '' },
                dothething: { type: 'Boolean', value: false },
                edges: { type: 'QueryList', value: { type: 'Query', nodeId: '', queries: [] } },
                size: { type: 'ValueWithUnits', value: { value: 0, units: '' } },
            },
        });
    });

    it('refuses a graph without a Define Feature node', () => {
        const description = describeGeneratedFeature([]);
        expect(description.ok).toBe(false);
        if (description.ok !== false) throw new Error('expected a refusal');
        expect(description.message).toContain('no Define Feature node');
    });

    it('refuses two Define Feature nodes rather than picking one', () => {
        const description = describeGeneratedFeature([
            defineNode('A Feature', []) as unknown as OnshapeNode,
            defineNode('B Feature', []) as unknown as OnshapeNode,
        ]);
        expect(description.ok).toBe(false);
        if (description.ok !== false) throw new Error('expected a refusal');
        expect(description.message).toContain('2 Define Feature nodes');
    });

    it('names the parameter whose spec type has no mapping', () => {
        const node = defineNode('Array Feature', [
            { name: 'items', btType: 'BTParameterSpecArray-2600' },
        ]);
        const description = describeGeneratedFeature([node as unknown as OnshapeNode]);
        expect(description.ok).toBe(false);
        if (description.ok !== false) throw new Error('expected a refusal');
        expect(description.message).toContain('"items"');
        expect(description.message).toContain('BTParameterSpecArray-2600');
    });

    it('refuses an enum parameter, whose legal values the graph does not carry', () => {
        const node = defineNode('Enum Feature', [
            { name: 'mode', btType: 'BTParameterSpecEnum-171' },
        ]);
        const description = describeGeneratedFeature([node as unknown as OnshapeNode]);
        expect(description.ok).toBe(false);
        if (description.ok !== false) throw new Error('expected a refusal');
        expect(description.message).toContain('"mode"');
        expect(description.message).toContain('Enum');
    });
});
