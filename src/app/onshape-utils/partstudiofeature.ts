/**
 * Insert the generated custom feature into a Part Studio (issue #2).
 *
 * The build pipeline (`generateFeatureStudioSource`) produces FeatureScript and
 * #1 writes it into a Feature Studio. This module is the next step: it asks
 * `PartStudioApi.addPartStudioFeature` to place *an instance* of the custom
 * feature that Feature Studio defines into a Part Studio's feature list.
 *
 * Three things this module is careful about, because each of them produces a
 * silently broken result if got wrong:
 *
 * 1. **Two documents, two targets.** The *defining* element is the Feature
 *    Studio (#1's target, `did/wvm/wvmid/eid`); the *consumer* is the Part
 *    Studio the feature is inserted into. `addPartStudioFeature`'s own
 *    `did/wvm/wvmid/eid` address the consumer, while `feature.namespace`
 *    identifies the defining Feature Studio. Using the consumer's id in the
 *    namespace resolves to nothing (the trap called out on the issue), so the
 *    namespace is never built from the consumer target and the two are
 *    validated separately.
 * 2. **The namespace is read, not guessed.** Onshape's local feature namespace
 *    is `e<elementId>::m<microversionId>` (evidence: the `namespace` values in
 *    `rete/editor.ts` / `rete/devEditor.ts` fixtures, and
 *    `serialization/graph-schema-types.ts` which parses exactly that shape).
 *    The microversion is per *element*, not the document's, so it is read from
 *    `getFeatureStudioSpecs` — the same call that proves the generated feature
 *    actually exists in the studio. When the defining target is already pinned
 *    to a microversion (`wvm === 'm'`) the value is known without a round trip.
 *    Cross-document namespaces need the full `d/v/e` form and are refused
 *    rather than approximated.
 * 3. **A rejected feature leaves nothing behind, and skew is never retried.**
 *    One POST, no retries. `rejectMicroversionSkew: true` makes Onshape refuse
 *    instead of best-effort re-interpreting, and a `microversionSkew` reply is
 *    reported for a human to resolve. When Onshape *accepts* the POST but marks
 *    the new feature `ERROR`, the feature id from the response is deleted again
 *    (only possible against a workspace) and the failure says whether the
 *    cleanup succeeded.
 *
 * Pure data in, strings out: Onshape access is injected as two small structural
 * interfaces (`PartStudioApiLike`, `FeatureStudioSpecsApiLike`) so the whole
 * flow is unit-testable against stubs (L2) — the real session is L3.
 */

import type {
    AddPartStudioFeatureRequest,
    BTMIndividualQueryBase139,
    BTMParameter1,
    BTMParameterBoolean144,
    BTMParameterEnum145,
    BTMParameterQuantity147,
    BTMParameterQueryList148,
    BTMParameterString149,
    BTFeatureDefinitionCall1406,
    BTFeatureDefinitionResponse1617,
    BTFeatureSpec129,
    BTFeatureSpecsResponse664,
} from 'onshape-typescript-fetch';
import {
    MemoryStorage,
    SettingsStorage,
    TargetParseResult,
    validateTarget,
    FeatureStudioTarget,
    FeatureStudioTargetSettings,
} from './featurestudiotarget';
import type { EnumType, OnshapeType, QueryList, ValueWithUnits } from './featurescripttypes';
import { describeUpstreamFailure } from './featurestudioupload';

/* ------------------------------------------------------------------ *
 * Consumer target
 * ------------------------------------------------------------------ */

/**
 * Where the generated feature is inserted.
 *
 * Same four path segments as `FeatureStudioTarget` (and the same validation —
 * `validateTarget` / `parseTargetString` are reused rather than re-written),
 * but a different meaning: this is the Part Studio, not the Feature Studio.
 * Keeping it a distinct name is the point: a `FeatureStudioTarget` must never
 * be passed where a `PartStudioTarget` is expected.
 */
export type PartStudioTarget = FeatureStudioTarget;

export const PART_STUDIO_TARGET_KEY = 'onshape-node-editor:part-studio-target';

/** Persistence for the Part Studio target; same machinery as #1's upload target. */
export class PartStudioTargetSettings extends FeatureStudioTargetSettings {
    constructor(storage: SettingsStorage = new MemoryStorage()) {
        super(storage, PART_STUDIO_TARGET_KEY);
    }
}

/* ------------------------------------------------------------------ *
 * Namespace
 * ------------------------------------------------------------------ */

/** Onshape's local (same-document) feature namespace: `e<eid>::m<microversion>`. */
export function localFeatureNamespace(defining: FeatureStudioTarget, microversion: string): string {
    const eid = typeof defining.eid === 'string' ? defining.eid.trim() : '';
    const micro = typeof microversion === 'string' ? microversion.trim() : '';
    if (eid === '') throw new Error('Cannot build a feature namespace without an element id.');
    if (micro === '') throw new Error(`Cannot build a feature namespace for ${eid} without a microversion.`);
    return `e${eid}::m${micro}`;
}

/** Parse `e<eid>::m<microversion>`; `undefined` for anything else (e.g. the std library's `""`). */
export function parseFeatureNamespace(namespace: string | undefined): { eid: string; microversion: string } | undefined {
    if (typeof namespace !== 'string') return undefined;
    const match = /^e([^:]+)::m([^:]+)$/.exec(namespace.trim());
    if (match == null) return undefined;
    return { eid: match[1], microversion: match[2] };
}

/* ------------------------------------------------------------------ *
 * Parameter mapping
 * ------------------------------------------------------------------ */

/** The graph's configured values, keyed by FeatureScript `parameterId`. */
export type ParameterValues = Record<string, OnshapeType<any>>;

/**
 * A control type with no `BTMParameter*` mapping.
 *
 * Thrown (not warned about) so a partially specified feature is never inserted:
 * the message names the parameter id, because that is the only thing a user can
 * act on.
 */
export class UnmappedParameterError extends Error {
    public readonly parameterId: string;
    public readonly parameterType: string;

    constructor(parameterId: string, parameterType: string, detail?: string) {
        super(
            `Parameter "${parameterId}" has type "${parameterType}"` +
            `${detail === undefined ? '' : ` (${detail})`}, which has no BTMParameter mapping; ` +
            'refusing to insert a half-specified feature.',
        );
        this.name = 'UnmappedParameterError';
        this.parameterId = parameterId;
        this.parameterType = parameterType;
    }
}

/** The FeatureScript type name of a `BTParameterSpec*` a `defineFeature` precondition declares. */
export function parameterTypeForSpec(btType: string | undefined): string | undefined {
    switch (btType) {
        case 'BTParameterSpecBoolean-170':
            return 'Boolean';
        case 'BTParameterSpecEnum-171':
            return 'Enum';
        case 'BTParameterSpecQuantity-173':
            return 'ValueWithUnits';
        case 'BTParameterSpecQuery-174':
            return 'QueryList';
        case 'BTParameterSpecString-175':
            return 'String';
        default:
            return undefined;
    }
}

/**
 * The value Onshape itself would show for a fresh instance of a declared
 * parameter: an unchecked box, an empty string, an empty query list.
 *
 * `ValueWithUnits` gets `0` with the unit left to the Feature Studio body, and
 * `Enum` is *not* defaulted — an enum's legal values live in the parameter spec,
 * which a `defineFeature` precondition (`definition.x is SomeEnum`) does not
 * carry here, so guessing one would insert a feature that cannot evaluate. Run
 * reports the parameter id instead.
 */
export function defaultParameterValue(type: string): OnshapeType<any> | undefined {
    switch (type) {
        case 'Boolean':
            return { type: 'Boolean', value: false };
        case 'String':
            return { type: 'String', value: '' };
        case 'Id':
            return { type: 'Id', value: '' };
        case 'ValueWithUnits':
            return { type: 'ValueWithUnits', value: { value: 0, units: '' } };
        case 'QueryList':
            return { type: 'QueryList', value: { type: 'Query', nodeId: '', queries: [] } };
        default:
            return undefined;
    }
}

/**
 * A `QueryList` value as the API wants it: `queries` is a list of individual
 * queries. A stored entry that is already JSON (a `BTMIndividualQuery*` object)
 * is passed through; a bare string is treated as a FeatureScript query
 * expression and wrapped in `BTMIndividualQuery-138.queryString`.
 *
 * DR-001: a captured *selection* cannot be inserted — it is microversion-bound.
 * Callers are expected to pass at most an empty list here, or a query expression
 * that re-evaluates.
 */
function toIndividualQueries(queries: unknown): BTMIndividualQueryBase139[] {
    if (!Array.isArray(queries)) return [];
    const result: BTMIndividualQueryBase139[] = [];
    for (const entry of queries) {
        if (typeof entry === 'string') {
            const text = entry.trim();
            if (text === '') continue;
            if (text.startsWith('{')) {
                try {
                    const parsed = JSON.parse(text) as BTMIndividualQueryBase139;
                    if (parsed != null && typeof parsed === 'object' && typeof parsed.btType === 'string') {
                        result.push(parsed);
                        continue;
                    }
                } catch {
                    // Not JSON after all: treat it as a query expression below.
                }
            }
            result.push({ btType: 'BTMIndividualQuery-138', queryString: text });
            continue;
        }
        if (entry != null && typeof entry === 'object') {
            result.push(entry as BTMIndividualQueryBase139);
        }
    }
    return result;
}

/** Map one configured control value to its `BTMParameter*` wire object. */
export function toBtParameter(parameterId: string, parameter: OnshapeType<any>): BTMParameter1 {
    const type = parameter?.type;
    switch (type) {
        case 'Boolean': {
            const value: BTMParameterBoolean144 = {
                btType: 'BTMParameterBoolean-144',
                parameterId,
                value: parameter.value === true,
            };
            return value;
        }
        case 'Enum': {
            const enumParameter = parameter as EnumType;
            const value: BTMParameterEnum145 = {
                btType: 'BTMParameterEnum-145',
                parameterId,
                value: String(enumParameter.value),
            };
            if (typeof enumParameter.enumName === 'string' && enumParameter.enumName !== '') {
                value.enumName = enumParameter.enumName;
            }
            return value;
        }
        case 'String':
        case 'Id': {
            const value: BTMParameterString149 = {
                btType: 'BTMParameterString-149',
                parameterId,
                value: parameter.value == null ? '' : String(parameter.value),
            };
            return value;
        }
        case 'ValueWithUnits': {
            const quantity = parameter.value as ValueWithUnits;
            if (quantity == null || typeof quantity.value !== 'number' || !Number.isFinite(quantity.value)) {
                throw new UnmappedParameterError(parameterId, type, 'expected { value: number, units: string }');
            }
            const units = typeof quantity.units === 'string' ? quantity.units : '';
            const value: BTMParameterQuantity147 = {
                btType: 'BTMParameterQuantity-147',
                parameterId,
                value: quantity.value,
                units,
                // `expression` is what Onshape displays and evaluates; with no
                // units it is a bare number, which is valid FeatureScript.
                expression: units === '' ? String(quantity.value) : `${quantity.value} ${units}`,
            };
            return value;
        }
        case 'QueryList': {
            const queryList = parameter.value as QueryList;
            const value: BTMParameterQueryList148 = {
                btType: 'BTMParameterQueryList-148',
                parameterId,
                queries: toIndividualQueries(queryList?.queries),
            };
            if (typeof queryList?.nodeId === 'string' && queryList.nodeId !== '') {
                value.nodeId = queryList.nodeId;
            }
            return value;
        }
        default:
            // Context, Selection and anything else the control layer may invent:
            // no wire mapping exists, and a guessed one would insert a feature
            // that resolves to the wrong entity.
            throw new UnmappedParameterError(parameterId, String(type));
    }
}

/**
 * Map every configured value, keyed by parameter id.
 *
 * Sorted by parameter id so a captured payload is stable and reviewable; the
 * API does not care about order.
 */
export function mapParameters(parameters: ParameterValues): BTMParameter1[] {
    return Object.keys(parameters)
        .sort()
        .map((parameterId) => toBtParameter(parameterId, parameters[parameterId]));
}

/* ------------------------------------------------------------------ *
 * Request
 * ------------------------------------------------------------------ */

/** What Run knows about the feature being inserted. */
export interface FeatureInsertion {
    /** The FeatureScript identifier of the generated feature (`camelize(featureTypeName)`). */
    featureType: string;
    /** User-visible instance name, e.g. `My New Feature 1`. */
    featureName: string;
    /** Values for every parameter the generated feature declares. */
    parameters: ParameterValues;
    /** Pre-resolved namespace; when omitted it is read from the Feature Studio. */
    namespaceOverride?: string;
}

/** One place where the request body is built, so a test can pin it. */
export function buildAddFeatureRequest(
    consumer: PartStudioTarget,
    namespace: string,
    insertion: FeatureInsertion,
): AddPartStudioFeatureRequest {
    const parameters = mapParameters(insertion.parameters);
    const call: BTFeatureDefinitionCall1406 = {
        btType: 'BTFeatureDefinitionCall-1406',
        // Skew is a decision for a human: refuse the best-effort re-interpretation
        // rather than let Onshape silently reinterpret geometry ids.
        rejectMicroversionSkew: true,
        feature: {
            btType: 'BTMFeature-134',
            featureType: insertion.featureType,
            name: insertion.featureName,
            namespace,
            parameters,
            returnAfterSubfeatures: false,
            suppressed: false,
        },
    };
    return {
        did: consumer.did,
        wvm: consumer.wvm,
        wvmid: consumer.wvmid,
        eid: consumer.eid,
        bTFeatureDefinitionCall1406: call,
    };
}

/* ------------------------------------------------------------------ *
 * Failure reporting
 * ------------------------------------------------------------------ */

export interface FeatureScriptProblem {
    /** Upstream text for this problem, verbatim. */
    message: string;
    line?: number;
    column?: number;
}

/**
 * Pull FeatureScript diagnostics out of an upstream error body.
 *
 * The `/api` proxy answers errors as `text/plain` (see #1), so the usual body is
 * a sentence containing `line 12 column 4`. A JSON body is also handled, both
 * the flat `{ message, line, column }` and Onshape's
 * `{ message, errors: [{ message, location: { line, column } }] }`.
 */
export function parseFeatureScriptProblems(body: string): FeatureScriptProblem[] {
    const text = typeof body === 'string' ? body : '';
    const trimmed = text.trim();
    if (trimmed === '') return [];

    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            const nested = parsed['errors'];
            if (Array.isArray(nested) && nested.length > 0) {
                const problems = nested.map((entry) => problemFromJson(entry as Record<string, unknown>)).filter(isProblem);
                if (problems.length > 0) return problems;
            }
            const single = problemFromJson(parsed);
            if (single.message !== '') return [single];
        } catch {
            // Not JSON: fall through to the plain-text path.
        }
    }

    return [withTextLocation({ message: text }, text)];
}

function problemFromJson(value: Record<string, unknown>): FeatureScriptProblem {
    const rawMessage = value?.['message'];
    const message = typeof rawMessage === 'string' ? rawMessage : JSON.stringify(value);
    return withLocation({ message }, value, (value?.['location'] as Record<string, unknown> | undefined) ?? undefined);
}

function withLocation(
    problem: FeatureScriptProblem,
    text: Record<string, unknown>,
    location?: Record<string, unknown>,
): FeatureScriptProblem {
    const line = numberOrUndefined(location?.['line'] ?? text?.['line']);
    const column = numberOrUndefined(location?.['column'] ?? text?.['column']);
    return {
        ...problem,
        ...(line === undefined ? {} : { line }),
        ...(column === undefined ? {} : { column }),
    };
}

function numberOrUndefined(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return undefined;
}

function isProblem(value: FeatureScriptProblem | undefined): value is FeatureScriptProblem {
    return value !== undefined;
}

/** `line 12 column 4` / `line 12, column 4` / `at 12:4` out of the plain-text body. */
function locationFromText(text: string): { line?: number; column?: number } {
    const pair = /line\s+(\d+)\s*[:,]\s*(?:column\s*)?(\d+)/i.exec(text);
    if (pair != null) return { line: Number(pair[1]), column: Number(pair[2]) };

    const line = /line\s+(\d+)/i.exec(text);
    const column = /column\s+(\d+)/i.exec(text);
    if (line != null) {
        return {
            line: Number(line[1]),
            ...(column == null ? {} : { column: Number(column[1]) }),
        };
    }

    const tail = /at\s+(\d+)\s*[:,]\s*(\d+)/i.exec(text);
    if (tail != null) return { line: Number(tail[1]), column: Number(tail[2]) };
    return {};
}

/** Fill in line/column from free text when the structured parse found none. */
function withTextLocation(problem: FeatureScriptProblem, text: string): FeatureScriptProblem {
    if (problem.line !== undefined) return problem;
    const { line, column } = locationFromText(text);
    return {
        ...problem,
        ...(line === undefined ? {} : { line }),
        ...(column === undefined ? {} : { column }),
    };
}

/** `"line 3, column 7"`, or an empty string when the payload did not say. */
export function formatProblemLocation(problem: FeatureScriptProblem): string {
    if (problem.line === undefined) return '';
    if (problem.column === undefined) return `line ${problem.line}`;
    return `line ${problem.line}, column ${problem.column}`;
}

/* ------------------------------------------------------------------ *
 * Inserter
 * ------------------------------------------------------------------ */

export interface DeleteFeatureRequest {
    did: string;
    /** `deletePartStudioFeature` addresses a *workspace*, not a wvm triplet. */
    wid: string;
    eid: string;
    fid: string;
}

export interface AddFeatureSpecsRequest {
    did: string;
    wvm: string;
    wvmid: string;
    eid: string;
}

/** The slice of `PartStudioApi` this module needs (structural, so a stub satisfies it). */
export interface PartStudioApiLike {
    addPartStudioFeature(request: AddPartStudioFeatureRequest): Promise<BTFeatureDefinitionResponse1617>;
    deletePartStudioFeature?(request: DeleteFeatureRequest): Promise<unknown>;
}

/** The slice of `FeatureStudioApi` used to read the defining element's namespace. */
export interface FeatureStudioSpecsApiLike {
    getFeatureStudioSpecs(request: AddFeatureSpecsRequest): Promise<BTFeatureSpecsResponse664>;
}

export interface SkewReport {
    /** `microversionSkew` as reported by Onshape. */
    microversionSkew: boolean;
    /** The microversion the request/response was based on, when reported. */
    sourceMicroversion?: string;
    /** The microversion encoded in the namespace that was used. */
    namespaceMicroversion?: string;
}

export type InsertStage = 'target' | 'namespace' | 'parameters' | 'api';

export type InsertOutcome =
    | {
          status: 'inserted';
          featureId?: string;
          featureType: string;
          namespace: string;
          parameters: BTMParameter1[];
          featureStatus?: string;
      }
    | {
          status: 'rejected';
          message: string;
          problems: FeatureScriptProblem[];
          namespace: string;
          /** The id Onshape assigned before rejecting, when it said. */
          featureId?: string;
          /** True when the half-created feature was deleted again. */
          removed: boolean;
          httpStatus?: number;
      }
    | {
          status: 'skew';
          message: string;
          skew: SkewReport;
          namespace?: string;
          featureId?: string;
      }
    | { status: 'failed'; stage: InsertStage; message: string; httpStatus?: number };

export interface PartStudioInserterOptions {
    /** `OnshapeAPI.partStudioApi`; `undefined` before `initAPIs()` has run. */
    partStudioApi: PartStudioApiLike | undefined;
    /** `OnshapeAPI.featureStudioApi`; only needed to read the namespace. */
    featureStudioApi: FeatureStudioSpecsApiLike | undefined;
    /** #1's Feature Studio target: the *defining* element. */
    getDefiningTarget: () => FeatureStudioTarget | undefined;
    /** The Part Studio to insert into: the *consumer*. */
    getConsumerTarget: () => PartStudioTarget | undefined;
    /** Where user-facing messages go (today: `App.reportMessage`). */
    notify: (message: string) => void;
}

/**
 * Insert the generated feature, with every side effect injected.
 *
 * Order matters: targets → namespace → parameters → one POST. Nothing reaches
 * Onshape before the namespace is known and every parameter is mapped, so a
 * refusal here leaves the Part Studio untouched.
 */
export class PartStudioFeatureInserter {
    private readonly options: PartStudioInserterOptions;

    constructor(options: PartStudioInserterOptions) {
        this.options = options;
    }

    public async insert(insertion: FeatureInsertion): Promise<InsertOutcome> {
        const consumerResult: TargetParseResult = validateTarget(this.options.getConsumerTarget());
        if (consumerResult.ok !== true) {
            return this.fail(
                'target',
                `No Part Studio target: ${consumerResult.error} Set one with did, wvm, wvmid and eid.`,
            );
        }
        const consumer = consumerResult.target;

        // `addPartStudioFeature` is a POST; Onshape only accepts writes against a
        // workspace. A version/microversion target is immutable, so say that here
        // instead of letting the API answer with an opaque 400.
        if (consumer.wvm !== 'w') {
            return this.fail(
                'target',
                `The Part Studio target is a ${consumer.wvm === 'v' ? 'version' : 'microversion'} ` +
                `(wvm "${consumer.wvm}"), which is immutable; Run needs the Part Studio's workspace target (wvm "w").`,
            );
        }

        const definingResult: TargetParseResult = validateTarget(this.options.getDefiningTarget());
        if (definingResult.ok !== true) {
            return this.fail(
                'target',
                `No Feature Studio target: ${definingResult.error} Upload the graph first (#1) and set its target.`,
            );
        }
        const defining = definingResult.target;

        if (insertion.featureType.trim() === '') {
            return this.fail('parameters', 'Cannot insert a feature with an empty featureType.');
        }

        const namespaceResult = await this.resolveNamespace(defining, consumer, insertion);
        if (namespaceResult.status !== 'resolved') {
            if (namespaceResult.status === 'skew') {
                this.options.notify(namespaceResult.message);
                return namespaceResult;
            }
            return this.fail(namespaceResult.stage, namespaceResult.message, namespaceResult.httpStatus);
        }
        const namespace = namespaceResult.namespace;

        const api = this.options.partStudioApi;
        if (api == null) {
            return this.fail('api', 'Onshape API is not initialized; Run needs a signed-in session.');
        }

        let request: AddPartStudioFeatureRequest;
        try {
            request = buildAddFeatureRequest(consumer, namespace, insertion);
        } catch (error) {
            if (error instanceof UnmappedParameterError) {
                return this.fail('parameters', error.message);
            }
            return this.fail('parameters', errorMessage(error));
        }
        const parameters = request.bTFeatureDefinitionCall1406?.feature?.parameters ?? [];

        let response: BTFeatureDefinitionResponse1617;
        try {
            response = await api.addPartStudioFeature(request);
        } catch (error) {
            const description = await describeUpstreamFailure(error);
            const problems = parseFeatureScriptProblems(description.message).map((problem) =>
                withTextLocation(problem, description.message),
            );
            const header = `${insertion.featureName} was not added to Part Studio ${consumer.eid}`;
            if (description.status === 400) {
                // A 400 from addPartStudioFeature is the FeatureScript compile /
                // parameter validation path: the feature was refused, not half
                // created. Report the upstream text and its location.
                const message = formatProblems(header, problems);
                this.options.notify(message);
                return {
                    status: 'rejected',
                    message,
                    problems,
                    namespace,
                    removed: false,
                    httpStatus: description.status,
                };
            }
            const message = `${header}: ${description.message}`;
            this.options.notify(message);
            return { status: 'failed', stage: 'api', message, httpStatus: description.status };
        }

        const featureId = typeof response?.feature?.featureId === 'string' ? response.feature.featureId : undefined;
        const featureStatus = response?.featureState?.featureStatus;

        // 1. Skew: never retried, always surfaced. `rejectMicroversionSkew` should
        //    make this a refusal, but the flag is the API's own report and wins.
        if (response?.microversionSkew === true) {
            const message =
                `Onshape reported a microversion skew while inserting ${insertion.featureName}` +
                ` (sourceMicroversion=${response.sourceMicroversion ?? 'not reported'},` +
                ` namespace=${namespace}). Nothing was retried; update the Feature Studio target` +
                ' microversion (or re-upload) and run again.';
            this.options.notify(message);
            return {
                status: 'skew',
                message,
                namespace,
                ...(featureId === undefined ? {} : { featureId }),
                skew: {
                    microversionSkew: true,
                    ...(response.sourceMicroversion === undefined
                        ? {}
                        : { sourceMicroversion: response.sourceMicroversion }),
                    ...(parseFeatureNamespace(namespace) === undefined
                        ? {}
                        : { namespaceMicroversion: parseFeatureNamespace(namespace)?.microversion }),
                },
            };
        }

        // 2. Accepted, but the feature is in error: delete it again so the tree has
        //    no half-created feature.
        if (featureStatus === 'ERROR' || featureStatus === 'UNKNOWN') {
            const removed = await this.deleteRejectedFeature(api, consumer, featureId);
            const problems: FeatureScriptProblem[] = [
                {
                    message:
                        `Onshape accepted ${insertion.featureName} but reported featureState.featureStatus = ${featureStatus}` +
                        (featureId === undefined ? '.' : ` for feature ${featureId}.`),
                },
            ];
            const cleanup = featureId === undefined
                ? 'The response carried no feature id, so nothing could be deleted; check the Part Studio.'
                : removed
                    ? `The half-created feature ${featureId} was deleted again.`
                    : `The half-created feature ${featureId} could NOT be deleted (deletePartStudioFeature needs a workspace target); remove it by hand.`;
            const message = formatProblems(`${insertion.featureName} was rejected`, problems) + `\n${cleanup}`;
            this.options.notify(message);
            return {
                status: 'rejected',
                message,
                problems,
                namespace,
                ...(featureId === undefined ? {} : { featureId }),
                removed,
            };
        }

        const message =
            `Inserted ${insertion.featureName} (${insertion.featureType}) into Part Studio ${consumer.eid}` +
            (featureId === undefined ? '' : ` as feature ${featureId}`) +
            ` with ${parameters.length} parameter(s), namespace ${namespace}.`;
        this.options.notify(message);
        return {
            status: 'inserted',
            ...(featureId === undefined ? {} : { featureId }),
            featureType: insertion.featureType,
            namespace,
            parameters,
            ...(featureStatus === undefined ? {} : { featureStatus }),
        };
    }

    private async resolveNamespace(
        defining: FeatureStudioTarget,
        consumer: PartStudioTarget,
        insertion: FeatureInsertion,
    ): Promise<
        | { status: 'resolved'; namespace: string }
        | { status: 'skew'; message: string; skew: SkewReport; namespace?: string }
        | { status: 'unresolved'; stage: InsertStage; message: string; httpStatus?: number }
    > {
        const override = insertion.namespaceOverride;
        if (override !== undefined) {
            const parsed = parseFeatureNamespace(override);
            if (parsed === undefined) {
                return {
                    status: 'unresolved',
                    stage: 'namespace',
                    message:
                        `"${override}" is not a local feature namespace; expected e<elementId>::m<microversion>.`,
                };
            }
            return { status: 'resolved', namespace: override.trim() };
        }

        // Namespace is a *local* reference (`e<eid>::m<microversion>`), which only
        // resolves inside the Feature Studio's own document. Refuse the
        // cross-document case instead of inserting an unresolved feature.
        if (defining.did !== consumer.did) {
            return {
                status: 'unresolved',
                stage: 'namespace',
                message:
                    `The Feature Studio (document ${defining.did}) and the Part Studio (document ${consumer.did}) ` +
                    'are in different documents. Inserting across documents needs the full document/version/' +
                    'element namespace, which this build does not construct; put both tabs in one document ' +
                    'or set the defining target to the Feature Studio in the Part Studio\'s document.',
            };
        }

        // A microversion-pinned target already names the microversion the spec is
        // defined at; no round trip needed.
        if (defining.wvm === 'm') {
            return { status: 'resolved', namespace: localFeatureNamespace(defining, defining.wvmid) };
        }

        const api = this.options.featureStudioApi;
        if (api == null) {
            return {
                status: 'unresolved',
                stage: 'namespace',
                message:
                    'Onshape API is not initialized; Run needs a signed-in session to read the Feature Studio specs.',
            };
        }

        let specs: BTFeatureSpecsResponse664;
        try {
            specs = await api.getFeatureStudioSpecs({
                did: defining.did,
                wvm: defining.wvm,
                wvmid: defining.wvmid,
                eid: defining.eid,
            });
        } catch (error) {
            const description = await describeUpstreamFailure(error);
            return {
                status: 'unresolved',
                stage: 'namespace',
                message: `Could not read the Feature Studio specs for ${defining.eid}: ${description.message}`,
                httpStatus: description.status,
            };
        }

        if (specs?.microversionSkew === true) {
            const message =
                `Onshape reported a microversion skew reading the Feature Studio ${defining.eid}` +
                ` (sourceMicroversion=${specs.sourceMicroversion ?? 'not reported'}). Nothing was inserted;` +
                ' re-upload the graph and set the target to the current microversion.';
            return {
                status: 'skew',
                message,
                skew: {
                    microversionSkew: true,
                    ...(specs.sourceMicroversion === undefined
                        ? {}
                        : { sourceMicroversion: specs.sourceMicroversion }),
                },
            };
        }

        const match = this.findSpec(specs?.featureSpecs, insertion.featureType);
        if (match == null) {
            const available = (specs?.featureSpecs ?? [])
                .map((spec) => spec?.featureType)
                .filter((featureType): featureType is string => typeof featureType === 'string' && featureType !== '');
            return {
                status: 'unresolved',
                stage: 'namespace',
                message:
                    `Feature Studio ${defining.eid} does not define "${insertion.featureType}"` +
                    (available.length === 0
                        ? ' (it defines no features at all).'
                        : ` (it defines: ${available.join(', ')}).`) +
                    ' Run Upload first so the generated feature exists, then Run again.',
            };
        }

        const namespace = typeof match.namespace === 'string' ? match.namespace.trim() : '';
        if (namespace === '') {
            return {
                status: 'unresolved',
                stage: 'namespace',
                message:
                    `Feature Studio ${defining.eid} has no namespace for "${insertion.featureType}"; ` +
                    'it is not resolvable from a Part Studio.',
            };
        }

        return { status: 'resolved', namespace };
    }

    private findSpec(specs: BTFeatureSpec129[] | undefined, featureType: string): BTFeatureSpec129 | undefined {
        if (!Array.isArray(specs)) return undefined;
        return specs.find((spec) => spec?.featureType === featureType);
    }

    /** Best-effort removal of a feature Onshape created but rejected. */
    private async deleteRejectedFeature(
        api: PartStudioApiLike,
        consumer: PartStudioTarget,
        featureId: string | undefined,
    ): Promise<boolean> {
        if (featureId === undefined || typeof api.deletePartStudioFeature !== 'function') return false;
        if (consumer.wvm !== 'w') return false;
        try {
            await api.deletePartStudioFeature({
                did: consumer.did,
                wid: consumer.wvmid,
                eid: consumer.eid,
                fid: featureId,
            });
            return true;
        } catch {
            return false;
        }
    }

    private fail(stage: InsertStage, message: string, httpStatus?: number): InsertOutcome {
        this.options.notify(message);
        return {
            status: 'failed',
            stage,
            message,
            ...(httpStatus === undefined ? {} : { httpStatus }),
        };
    }
}

/** `<header>: <problem> (line L, column C)` for each problem, one per line. */
export function formatProblems(header: string, problems: FeatureScriptProblem[]): string {
    if (problems.length === 0) return header;
    const lines = problems.map((problem) => {
        const location = formatProblemLocation(problem);
        const text = problem.message.trim();
        return location === '' ? text : `${text} (${location})`;
    });
    return `${header}:\n${lines.join('\n')}`;
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message || error.name;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}
