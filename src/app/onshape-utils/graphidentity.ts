/**
 * Issue #31 — node graph identity and deploy targets.
 *
 * The deploy target is the *active document* (`ClientMessaging.documentId` /
 * `workspaceId`, surfaced on `BaseApp`), never a browser-stored element id.
 * Each graph records the element id of its Feature Studio; the studio is
 * resolved by reading the document's elements and matching that recorded id
 * ({@link resolveGraphTarget}). The serialized graph lives in its own app
 * element, one per graph, created through the existing `AppStorage` /
 * `NodeStore` machinery — this module does not write a second element store.
 *
 * Drift (studio missing, graph element missing, two elements claiming one
 * graph) blocks the write and is reported through the `buildlog.ts` severity
 * vocabulary (`LogSeverity`); there is no second check model. The caller
 * reports each {@link DriftIssue} and must not proceed to an upload.
 *
 * Pure-ish: Onshape access is injected as interfaces, so resolution and the
 * create flow are exercised by unit tests against stubs (L1). The real
 * document round trip is L3 and is not simulated here.
 */

import type {
    BTDocumentElementInfo,
    BTModelElementParams,
} from 'onshape-typescript-fetch';
import type { FeatureStudioTarget } from './featurestudiotarget';
import { describeUpstreamFailure } from './featurestudioupload';
import type { LogSeverity } from '../logging/buildlog';

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/**
 * What a graph records about itself so its deploy target can be reconstructed
 * from the document alone. Element ids are stable across renames — a renamed
 * Feature Studio still resolves, because matching is by id, never by name.
 */
export interface GraphIdentity {
    /** Display name; also the name of the Feature Studio created for it. */
    graphName: string;
    /** Recorded element id of this graph's Feature Studio. */
    featureStudioElementId: string;
    /** App element holding this graph's serialized form (one per graph). */
    graphElementId: string;
    /** Name of the app element, used to detect a second element claiming it. */
    graphElementName: string;
}

/** The app element for a graph is named after the graph. */
export function graphElementNameFor(graphName: string): string {
    return `${graphName} graph`;
}

/** Build the identity for a freshly created graph. */
export function createGraphIdentity(
    graphName: string,
    featureStudioElementId: string,
    graphElementId: string,
): GraphIdentity {
    return {
        graphName,
        featureStudioElementId,
        graphElementId,
        graphElementName: graphElementNameFor(graphName),
    };
}

/* ------------------------------------------------------------------ */
/* Resolution (pure)                                                   */
/* ------------------------------------------------------------------ */

export type DriftKind = 'studio-missing' | 'graph-element-missing' | 'duplicate-graph-element';

export interface DriftIssue {
    kind: DriftKind;
    /** Always `error`: drift blocks the write, it is not a warning. */
    severity: LogSeverity;
    message: string;
}

export type ResolveResult =
    | {
          status: 'ok';
          studio: BTDocumentElementInfo;
          graphElement: BTDocumentElementInfo;
          target: FeatureStudioTarget;
      }
    | { status: 'none' }
    | { status: 'drift'; issues: DriftIssue[] };

export interface DocumentContext {
    did: string;
    workspaceId: string;
}

function error(kind: DriftKind, message: string): DriftIssue {
    return { kind, severity: 'error', message };
}

/**
 * Resolve a graph's deploy target from a document's element list.
 *
 * - The Feature Studio is the element whose `id` equals the recorded
 *   `featureStudioElementId`. Its current `name` is irrelevant (renamed
 *   studios resolve).
 * - The graph element is the application element claiming this graph: by
 *   recorded id or by the graph element name. More than one claimant is
 *   drift — two elements must never both claim one graph.
 * - No studio and no claimant at all is `none`: the caller offers
 *   "Make new node graph" (create-on-first-open).
 * - A missing studio or graph element (with something present) is drift.
 */
export function resolveGraphTarget(
    elements: readonly BTDocumentElementInfo[],
    identity: GraphIdentity,
    context: DocumentContext,
): ResolveResult {
    const studios = elements.filter((el) => el.elementType === 'FEATURESTUDIO');
    const appElements = elements.filter((el) => el.elementType === 'APPLICATION');

    const studioMatches = studios.filter((el) => el.id === identity.featureStudioElementId);

    const byId = appElements.filter((el) => el.id === identity.graphElementId);
    const byName = appElements.filter((el) => el.name === identity.graphElementName);
    // Claimants, deduplicated by id (an element matching both ways is one).
    const claimants = new Map<string, BTDocumentElementInfo>();
    for (const el of [...byName, ...byId]) {
        if (el.id != null) claimants.set(el.id, el);
    }

    if (studioMatches.length === 0 && claimants.size === 0) {
        return { status: 'none' };
    }

    const issues: DriftIssue[] = [];
    if (studioMatches.length === 0) {
        issues.push(
            error(
                'studio-missing',
                `Feature Studio ${identity.featureStudioElementId} for graph "${identity.graphName}" ` +
                    `is missing from document ${context.did}; the write is blocked.`,
            ),
        );
    }
    if (claimants.size === 0) {
        issues.push(
            error(
                'graph-element-missing',
                `Graph element ${identity.graphElementId} ("${identity.graphElementName}") for graph ` +
                    `"${identity.graphName}" is missing from document ${context.did}; the write is blocked.`,
            ),
        );
    }
    if (claimants.size > 1) {
        const ids = [...claimants.keys()].join(', ');
        issues.push(
            error(
                'duplicate-graph-element',
                `${claimants.size} elements (${ids}) claim graph "${identity.graphName}" ` +
                    `(element "${identity.graphElementName}"); the write is blocked.`,
            ),
        );
    }
    if (issues.length > 0) {
        return { status: 'drift', issues };
    }

    const studio = studioMatches[0];
    const graphElement = byId[0] ?? byName[0];
    return {
        status: 'ok',
        studio,
        graphElement,
        target: {
            did: context.did,
            wvm: 'w',
            wvmid: context.workspaceId,
            eid: identity.featureStudioElementId,
        },
    };
}

/* ------------------------------------------------------------------ */
/* Injected API surface                                                */
/* ------------------------------------------------------------------ */

export interface GraphIdentityApis {
    documentApi: {
        getElementsInDocument(request: {
            did: string;
            wvm: string;
            wvmid: string;
        }): Promise<BTDocumentElementInfo[]>;
    };
    featureStudioApi: {
        createFeatureStudio(request: {
            did: string;
            wid: string;
            bTModelElementParams: BTModelElementParams;
        }): Promise<BTDocumentElementInfo>;
    };
    /** Creates (via `NodeStore`/`AppStorage`) the app element for a graph. Returns its element id. */
    createGraphElement: (elementName: string) => Promise<string>;
    /** Writes the serialized graph into the graph element. Optional. */
    persistGraph?: (graphElementId: string, serializedGraph: string) => Promise<void>;
}

export interface GraphIdentityOptions {
    apis: GraphIdentityApis;
    context: DocumentContext;
    /** Confirmation before creating elements in the user's document. */
    confirm: (message: string) => boolean | Promise<boolean>;
    /** Where drift and creation outcomes go (`App.reportMessage`). */
    report: (severity: LogSeverity, message: string, source?: string) => void;
    /** Serialized form of the current editor graph, when one is open. */
    getSerializedGraph?: () => string | undefined;
}

export type EnsureOutcome =
    | { status: 'resolved'; identity: GraphIdentity; target: FeatureStudioTarget }
    | { status: 'created'; identity: GraphIdentity; target: FeatureStudioTarget }
    | { status: 'declined'; identity?: GraphIdentity }
    | { status: 'drift'; issues: DriftIssue[] }
    | { status: 'failed'; message: string };

/**
 * The create-on-first-open / `+` create flow plus resolution against a live
 * document. Creating elements needs an explicit confirmation and a real
 * failure path: a refused confirm creates nothing, and an API failure is
 * reported verbatim and stops the flow before anything else is created.
 */
export class GraphIdentityService {
    private readonly options: GraphIdentityOptions;

    constructor(options: GraphIdentityOptions) {
        this.options = options;
    }

    public async listElements(): Promise<BTDocumentElementInfo[]> {
        const { did, workspaceId } = this.options.context;
        return this.options.apis.documentApi.getElementsInDocument({
            did,
            wvm: 'w',
            wvmid: workspaceId,
        });
    }

    /** Resolve an already-recorded identity; drift is reported, never thrown. */
    public async resolve(identity: GraphIdentity): Promise<ResolveResult> {
        const result = resolveGraphTarget(await this.listElements(), identity, this.options.context);
        if (result.status === 'drift') {
            for (const issue of result.issues) {
                this.options.report(issue.severity, issue.message, 'upload');
            }
        }
        return result;
    }

    /**
     * Make `identity` (or a new graph named `graphName`) the deploy target.
     * With an identity that resolves, nothing is created. With `none`, or
     * with no identity (first open), the user is offered "Make new node
     * graph" and one Feature Studio plus one graph element are created.
     * Drift blocks: the issues are reported and nothing is written.
     */
    public async ensureGraph(
        identity: GraphIdentity | undefined,
        graphName: string,
    ): Promise<EnsureOutcome> {
        if (identity != null) {
            const resolved = await this.resolve(identity);
            if (resolved.status === 'ok') {
                return { status: 'resolved', identity, target: resolved.target };
            }
            if (resolved.status === 'drift') {
                return { status: 'drift', issues: resolved.issues };
            }
            // 'none': fall through to create-on-first-open.
        }
        return this.createGraph(graphName);
    }

    /** `+`: an additional graph with its own studio and element. */
    public async createAdditionalGraph(graphName: string): Promise<EnsureOutcome> {
        return this.createGraph(graphName);
    }

    private async createGraph(graphName: string): Promise<EnsureOutcome> {
        const name = graphName.trim();
        if (name === '') {
            const message = 'A graph name is required to make a new node graph.';
            this.options.report('error', message, 'editor');
            return { status: 'failed', message };
        }

        const accepted = await this.options.confirm(
            `Make new node graph "${name}" in this document?\n\n` +
                `This creates a Feature Studio named "${name}" and a graph element ` +
                `"${graphElementNameFor(name)}" to hold the serialized graph.`,
        );
        if (accepted !== true) {
            this.options.report('info', `Cancelled: no node graph "${name}" was created.`, 'editor');
            return { status: 'declined' };
        }

        const { did, workspaceId } = this.options.context;

        let studioId: string;
        try {
            const studio = await this.options.apis.featureStudioApi.createFeatureStudio({
                did,
                wid: workspaceId,
                bTModelElementParams: { name },
            });
            if (studio?.id == null) {
                const message = `Creating the Feature Studio for graph "${name}" returned no element id.`;
                this.options.report('error', message, 'editor');
                return { status: 'failed', message };
            }
            studioId = studio.id;
        } catch (createError) {
            const description = await describeUpstreamFailure(createError);
            this.options.report('error', description.message, 'editor');
            return { status: 'failed', message: description.message };
        }

        let graphElementId: string;
        try {
            graphElementId = await this.options.apis.createGraphElement(graphElementNameFor(name));
        } catch (createError) {
            const description = await describeUpstreamFailure(createError);
            this.options.report('error', description.message, 'editor');
            return { status: 'failed', message: description.message };
        }

        const identity = createGraphIdentity(name, studioId, graphElementId);

        const serialized = this.options.getSerializedGraph?.();
        if (typeof serialized === 'string' && this.options.apis.persistGraph != null) {
            try {
                await this.options.apis.persistGraph(graphElementId, serialized);
            } catch (persistError) {
                const description = await describeUpstreamFailure(persistError);
                this.options.report('error', description.message, 'editor');
                return { status: 'failed', message: description.message };
            }
        }

        this.options.report(
            'info',
            `Created node graph "${name}": Feature Studio ${studioId} and graph element ${graphElementId}.`,
            'editor',
        );
        return {
            status: 'created',
            identity,
            target: { did, wvm: 'w', wvmid: workspaceId, eid: studioId },
        };
    }
}
