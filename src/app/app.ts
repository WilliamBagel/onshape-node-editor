/**
 * Copyright 2025 "WilliamBagel" William Degele
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the “Software”), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom
 * the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR
 * OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 * ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

import { BaseApp } from "./common/baseapp";
import { createApp } from 'vue'
import AppRoot from './App.vue'
import { UserInfo } from "./onshape-utils/userinfo";
import { STD } from "./onshape-utils/stdlib";
import { tooltipDirective } from "./components/tooltip/TooltipDirective";
import { describeLiveSelectionDependencies } from "./onshape-utils/liveselectionguard";
import {
    browserStorage,
    FeatureStudioTarget,
    FeatureStudioTargetSettings,
    formatTarget,
    MemoryStorage,
} from "./onshape-utils/featurestudiotarget";
import {
    GraphIdentity,
    GraphIdentityService,
    graphElementNameFor,
    type EnsureOutcome,
    type ResolveResult,
} from "./onshape-utils/graphidentity";
import { NodeStore } from "./onshape-utils/nodestore";
import {
    FeatureStudioUploader,
    UploadOutcome,
} from "./onshape-utils/featurestudioupload";
import { BuildLogStore, type LogSeverity } from "./logging/buildlog";
import { confirm as confirmDialog } from "./ui/dialog";
import {
    FeatureInsertion,
    InsertOutcome,
    PartStudioFeatureInserter,
    PartStudioTarget,
    PartStudioTargetSettings,
} from "./onshape-utils/partstudiofeature";
import { resolveSinglePartStudio } from "./onshape-utils/partstudiotarget";
import { saveGraphVerified, type SaveOutcome } from "./onshape-utils/graphsaveopen";

export class App extends BaseApp {
    public myserver = 'https://onshape-node-editor-function.azurewebsites.net';
    public myclient = 'https://williambagel.github.io/onshape-node-editor';
    public userinfo!: UserInfo;
    public developerMode = false;
    /**
     * #31: graphs known in this session and the one currently deployed. The
     * deploy target is the active document (`documentId`/`workspaceId` from
     * the extension bootstrap) plus the active graph's recorded element ids —
     * the browser-stored `feature-studio-target` key is NOT an authority
     * anymore and its legacy value is cleared in `start()`.
     */
    public graphIdentities: GraphIdentity[] = [];
    public activeGraphIdentity: GraphIdentity | undefined;
    /**
     * Supplies the serialized form of the open editor graph when a graph is
     * created, so it can be written into the new graph element. Left unset
     * until the Save/Open path (#6) exposes the editor serializer; the
     * element is still created per graph and the write goes through
     * `NodeStore.setNodeData` once a provider exists.
     */
    public serializedGraphProvider: (() => string | undefined) | undefined;
    /**
     * #2: the Part Studio the generated feature is inserted into. A separate
     * field (and a separate storage key) from the Feature Studio target: the
     * defining element and the consumer element are different documents tabs,
     * and mixing them up is the defect the issue warns about.
     */
    public partStudioTargets = new PartStudioTargetSettings(browserStorage() ?? new MemoryStorage());
    /**
     * #4: the build/upload/run log. Everything the pipeline reports lands here
     * and is rendered by `LogPanel.vue`; the panel is the only place those
     * outcomes are visible (the console is no longer the log).
     */
    public log = new BuildLogStore();
    /**
     * Confirmation for overwriting a non-empty Feature Studio. Routed through
     * the in-app dialog service (#34) but kept as a replaceable seam: a test
     * can assign a synchronous stub, and every caller already `await`s it.
     */
    public confirmUpload: (diffText: string) => boolean | Promise<boolean> = async (diffText) => {
        try {
            return await confirmDialog({
                title: 'Overwrite Feature Studio?',
                body: diffText,
                confirmLabel: 'Overwrite',
                danger: true,
            });
        } catch {
            return false;
        }
    };

    /**
     * Confirmation for creating a Feature Studio + graph element in the
     * user's document (#31). Same seam as `confirmUpload`: the in-app dialog
     * is the default, tests substitute a stub.
     */
    public confirmCreateGraph: (message: string) => boolean | Promise<boolean> = async (message) => {
        try {
            return await confirmDialog({
                title: 'Create node graph in this document?',
                body: message,
                confirmLabel: 'Create',
            });
        } catch {
            return false;
        }
    };

    public start(): void {
        this.userinfo = new UserInfo(this.onshape);

        // #31: the browser-stored `feature-studio-target` key must not survive
        // as the Feature Studio authority; drop any legacy value now that the
        // deploy target is the active document plus the graph's recorded ids.
        new FeatureStudioTargetSettings(browserStorage() ?? new MemoryStorage()).clear();

        this.startVueApp(this.developerMode);

        this.processUserInfo();

        this.getStandardLibrary();
    }

    /* --- #31: graph identity / deploy target --------------------------- */

    /**
     * The deploy target: the active document plus the active graph's recorded
     * Feature Studio element id. `undefined` until a graph exists in this
     * session — resolution against the document's elements happens in
     * `resolveGraphTarget()` before any write.
     */
    public getFeatureStudioTarget(): FeatureStudioTarget | undefined {
        const identity = this.activeGraphIdentity;
        if (identity == null || this.documentId === '' || this.workspaceId === '') {
            return undefined;
        }
        return {
            did: this.documentId,
            wvm: 'w',
            wvmid: this.workspaceId,
            eid: identity.featureStudioElementId,
        };
    }

    private graphIdentityService(): GraphIdentityService | undefined {
        const api = this.onshape;
        if (api == null || this.documentId === '' || this.workspaceId === '') {
            return undefined;
        }
        const did = this.documentId;
        const wid = this.workspaceId;
        return new GraphIdentityService({
            apis: {
                documentApi: api.documentApi,
                featureStudioApi: api.featureStudioApi,
                // Reuses the existing AppStorage/NodeStore element machinery.
                createGraphElement: (elementName) =>
                    new NodeStore(api).createGraphElement(did, wid, elementName),
                persistGraph: async (graphElementId, serializedGraph) => {
                    const store = new NodeStore(api);
                    await store.initFromExisting(did, graphElementId, graphElementNameFor(''));
                    await store.setNodeData({ reteJSON: serializedGraph });
                },
            },
            context: { did, workspaceId: wid },
            confirm: (message) => this.confirmCreateGraph(message),
            report: (severity, message, source) => this.reportMessage(message, severity, source),
            getSerializedGraph: () => this.serializedGraphProvider?.(),
        });
    }

    private registerGraph(identity: GraphIdentity): void {
        if (!this.graphIdentities.some((known) => known.graphElementId === identity.graphElementId)) {
            this.graphIdentities.push(identity);
        }
        this.activeGraphIdentity = identity;
    }

    /**
     * Resolve the active graph against the active document's elements. Drift
     * is reported through the log (`severity: 'error'`, source `upload`) and
     * the caller must not write.
     */
    public async resolveGraphTarget(): Promise<ResolveResult | undefined> {
        const service = this.graphIdentityService();
        if (service == null || this.activeGraphIdentity == null) {
            return undefined;
        }
        return service.resolve(this.activeGraphIdentity);
    }

    /**
     * First open / deploy: resolve the active graph, or offer "Make new node
     * graph" and create its Feature Studio + graph element. Returns the
     * outcome; a successful create/resolve makes the graph the active one.
     */
    public async ensureGraphForDeploy(graphName: string): Promise<EnsureOutcome | undefined> {
        const service = this.graphIdentityService();
        if (service == null) {
            this.reportMessage(
                'No active Onshape document: the app must run inside an Onshape document to deploy.',
                'error',
                'upload',
            );
            return undefined;
        }
        const outcome = await service.ensureGraph(this.activeGraphIdentity, graphName);
        if (outcome.status === 'created' || outcome.status === 'resolved') {
            this.registerGraph(outcome.identity);
        }
        return outcome;
    }

    /** `+`: an additional graph with its own studio and element. */
    public async createAdditionalGraph(graphName: string): Promise<EnsureOutcome | undefined> {
        const service = this.graphIdentityService();
        if (service == null) {
            this.reportMessage(
                'No active Onshape document: the app must run inside an Onshape document to create a graph.',
                'error',
                'editor',
            );
            return undefined;
        }
        const outcome = await service.createAdditionalGraph(graphName);
        if (outcome.status === 'created') {
            this.registerGraph(outcome.identity);
        }
        return outcome;
    }

    /**
     * #6: write the open graph into its `NodeStore` element, then read it
     * back and only claim success on an exact round-trip. With no active
     * graph yet, the element (and its Feature Studio) is created first —
     * that create path (`ensureGraphForDeploy`) already persists the
     * serialized graph through the provider, and the read-back below is
     * what verifies it. Every outcome is reported through the log.
     */
    public async saveGraph(graphName: string): Promise<SaveOutcome> {
        const api = this.onshape;
        const did = this.documentId;
        const wid = this.workspaceId;
        const name = graphName.trim() === '' ? 'Untitled graph' : graphName.trim();
        if (api == null || did === '' || wid === '') {
            const outcome: SaveOutcome = {
                status: 'failed',
                stage: 'write',
                message: 'No active Onshape document: the app must run inside an Onshape document to save.',
            };
            this.reportMessage(`Save failed (write): ${outcome.message}`, 'error', 'editor');
            return outcome;
        }

        const writeToActiveElement = async (reteJSON: string): Promise<void> => {
            const identity = this.activeGraphIdentity;
            if (identity == null) {
                throw new Error('No active graph element to write to.');
            }
            const store = new NodeStore(api);
            await store.initFromExisting(did, identity.graphElementId, graphElementNameFor(identity.graphName));
            await store.setNodeData({ reteJSON });
        };

        const outcome = await saveGraphVerified({
            serialize: () => {
                const serialized = this.serializedGraphProvider?.();
                if (typeof serialized !== 'string' || serialized === '') {
                    throw new Error('No editor graph is available to save yet.');
                }
                return serialized;
            },
            storage: {
                write: async (reteJSON) => {
                    if (this.activeGraphIdentity != null) {
                        await writeToActiveElement(reteJSON);
                        return;
                    }
                    const ensured = await this.ensureGraphForDeploy(name);
                    if (ensured == null) {
                        throw new Error('Could not create a graph element in this document.');
                    }
                    if (ensured.status === 'created') {
                        // ensureGraphForDeploy's persistGraph already wrote the
                        // serialized graph into the new element; the read-back
                        // in saveGraphVerified is what verifies it.
                        return;
                    }
                    if (ensured.status === 'resolved') {
                        await writeToActiveElement(reteJSON);
                        return;
                    }
                    if (ensured.status === 'failed') {
                        throw new Error(ensured.message);
                    }
                    if (ensured.status === 'drift') {
                        throw new Error(ensured.issues.map((issue) => issue.message).join(' '));
                    }
                    throw new Error(`Creating graph "${name}" was cancelled; nothing was saved.`);
                },
                read: async () => {
                    const identity = this.activeGraphIdentity;
                    if (identity == null) {
                        return undefined;
                    }
                    const store = new NodeStore(api);
                    await store.initFromExisting(did, identity.graphElementId, graphElementNameFor(identity.graphName));
                    const data = await store.getNodeData();
                    return data?.reteJSON;
                },
            },
        });

        if (outcome.status === 'saved') {
            this.reportMessage(
                `Saved graph "${this.activeGraphIdentity?.graphName ?? name}" (${outcome.bytes} bytes; verified by reading it back).`,
                'info',
                'editor',
            );
        } else {
            this.reportMessage(`Save failed (${outcome.stage}): ${outcome.message}`, 'error', 'editor');
        }
        return outcome;
    }

    /**
     * #4: record a user-facing message in the log and show it as a bubble.
     *
     * Severity is the caller's decision (never sniffed from the text); the
     * default keeps existing one-line callers informational. `source` names the
     * pipeline stage: `build`, `upload`, `run`, or `editor` for everything else.
     */
    public reportMessage(
        message: string,
        severity: LogSeverity = 'info',
        source: string = 'editor',
    ): void {
        if (message == null || message === '') return;
        this.log.add({ severity, source, message });
        this.clientMessaging?.showMessageBubble(message);
    }

    /**
     * #4: the Build button's outcome.
     *
     * `source` is what `studioEvents.build()` resolved to (`undefined` when the
     * generator found nothing to generate from). The generated FeatureScript is
     * attached as `detail` so the panel can show it instead of the console.
     */
    public reportBuildResult(source: string | undefined, failure?: string): void {
        if (failure !== undefined) {
            this.log.add({ severity: 'error', source: 'build', message: `Build failed: ${failure}` });
            return;
        }
        if (typeof source !== 'string' || source === '') {
            this.log.add({
                severity: 'error',
                source: 'build',
                message: 'Build produced no FeatureScript. Connect an Output node and try again.',
            });
            return;
        }
        this.log.add({
            severity: 'info',
            source: 'build',
            message: `Built FeatureScript (${source.length} bytes).`,
            detail: source,
            detailLabel: 'Generated FeatureScript',
        });
    }

    /**
     * #4: one typed entry per Run, with the failure text as the panel's detail
     * block. Severity comes from the typed `InsertOutcome`, never from the text -
     * the same rule `reportUploadOutcome` follows.
     *
     * (The merge that landed #2 next to #4 replaced #4's "Run is not implemented"
     * placeholder: Run is implemented now, so that entry had no way to be reached.)
     */
    private reportInsertOutcome(outcome: InsertOutcome): void {
        switch (outcome.status) {
            case 'inserted':
                this.log.add({
                    severity: 'info',
                    source: 'run',
                    message: `Inserted ${outcome.featureType} into the Part Studio${outcome.featureId !== undefined ? ` (feature ${outcome.featureId})` : ''}.`,
                    detail: JSON.stringify({ namespace: outcome.namespace, parameters: outcome.parameters }, null, 2),
                    detailLabel: 'Inserted feature request',
                });
                return;
            case 'rejected':
                this.log.add({
                    severity: 'error',
                    source: 'run',
                    message: `Run rejected the feature${outcome.removed ? ' (the half-created feature was removed)' : ''}: ${outcome.message}`,
                    detail: outcome.message,
                    detailLabel: 'FeatureScript problems',
                });
                return;
            case 'skew':
                this.log.add({
                    severity: 'error',
                    source: 'run',
                    message: `Run refused on microversion skew: ${outcome.message}`,
                    detail: JSON.stringify(outcome.skew, null, 2),
                    detailLabel: 'Microversion skew',
                });
                return;
            case 'failed':
                this.log.add({
                    severity: 'error',
                    source: 'run',
                    message: `Run failed (${outcome.stage}): ${outcome.message}`,
                });
                return;
        }
    }

    /** #4: the upload flow's typed result. Text bodies stay verbatim. */
    private reportUploadOutcome(outcome: UploadOutcome): void {
        switch (outcome.status) {
            case 'uploaded':
                this.log.add({
                    severity: 'info',
                    source: 'upload',
                    message: `${outcome.created ? 'Created and wrote' : 'Wrote'} ${outcome.contents.length} bytes to Feature Studio ${outcome.target.eid}.`,
                    detail: outcome.contents,
                    detailLabel: 'Uploaded FeatureScript',
                });
                return;
            case 'unchanged':
                this.log.add({
                    severity: 'info',
                    source: 'upload',
                    message: `Feature Studio ${outcome.target.eid} is already up to date; nothing was written.`,
                    detail: outcome.contents,
                    detailLabel: 'FeatureScript already in the Feature Studio',
                });
                return;
            case 'cancelled':
                this.log.add({
                    severity: 'warning',
                    source: 'upload',
                    message: 'Upload cancelled; the Feature Studio was not modified.',
                });
                return;
            case 'failed':
                this.log.add({
                    severity: 'error',
                    source: 'upload',
                    message: `Upload failed (${outcome.stage}): ${outcome.message}`,
                });
                return;
        }
    }

    /**
     * Upload the generated FeatureScript to the configured Feature Studio.
     *
     * `source` is the string `generateFeatureStudioSource()` returned; it is
     * handed to Onshape byte-for-byte. Returns the outcome so the caller (and
     * tests) can tell "wrote", "already up to date" and "refused" apart.
     */
    public async uploadFeatureStudio(source: string | undefined): Promise<UploadOutcome> {
        // #31: drift blocks the write. Resolve the active graph against the
        // document's elements first; a missing studio/element or two elements
        // claiming one graph is reported and nothing is written.
        const identity = this.activeGraphIdentity;
        if (identity != null) {
            const resolved = await this.resolveGraphTarget();
            if (resolved?.status === 'drift') {
                const outcome: UploadOutcome = {
                    status: 'failed',
                    stage: 'target',
                    message:
                        `Deploy target drift for graph "${identity.graphName}": ` +
                        resolved.issues.map((issue) => issue.message).join(' '),
                };
                this.reportUploadOutcome(outcome);
                return outcome;
            }
        }
        const uploader = new FeatureStudioUploader({
            api: this.onshape?.featureStudioApi,
            getTarget: () => this.getFeatureStudioTarget(),
            // The uploader's per-step messages stay on the parent-frame bubble
            // path; the typed panel entry is written once, below, from the
            // returned outcome so its severity and detail are known exactly.
            notify: (message) => this.clientMessaging?.showMessageBubble(message),
            confirm: (diffText) => this.confirmUpload(diffText),
        });
        return uploader.upload(source).then((outcome) => {
            this.reportUploadOutcome(outcome);
            return outcome;
        });
    }

    /* --- #2: Part Studio insertion target ------------------------------- */

    /** The persisted Part Studio target, or `undefined` when none is set. */
    public getPartStudioTarget(): PartStudioTarget | undefined {
        return this.partStudioTargets.get();
    }

    /** Persist a Part Studio target from a typed object or its `did=...&wvm=...` string form. */
    public setPartStudioTarget(target: PartStudioTarget | string): PartStudioTarget {
        const stored = this.partStudioTargets.set(target);
        this.reportMessage(`Part Studio target set to ${formatTarget(stored)}`);
        return stored;
    }

    /** A starting point for the target prompt: this document and workspace, no element id. */
    public suggestPartStudioTarget(): string {
        return `did=${this.documentId ?? ''},wvm=w,wvmid=${this.workspaceId ?? ''},eid=`;
    }

    /**
     * #2: auto-resolve the run target from the active document.
     *
     * Lists the active document's elements and, when exactly one Part Studio
     * exists, persists it as the target and returns it — so Run never asks
     * for a raw id string in the single-studio case. Zero or multiple Part
     * Studios returns `undefined` without prompting; the caller (`runRun()`)
     * then falls back to the manual dialog prompt. An already-configured
     * target is returned as-is (auto-resolution is never consulted).
     */
    public async resolveSinglePartStudioTarget(): Promise<PartStudioTarget | undefined> {
        const existing = this.getPartStudioTarget();
        if (existing != null) return existing;

        const documentApi = this.onshape?.documentApi;
        if (documentApi == null || this.documentId === '' || this.workspaceId === '') {
            this.reportMessage(
                'Cannot auto-select a Part Studio: no active Onshape document. Choose the Part Studio target manually.',
                'warning',
                'run',
            );
            return undefined;
        }

        let result;
        try {
            result = await resolveSinglePartStudio(documentApi, {
                did: this.documentId,
                workspaceId: this.workspaceId,
            });
        } catch (error) {
            this.reportMessage(
                `Cannot auto-select a Part Studio: ${error instanceof Error ? error.message : String(error)} Choose the Part Studio target manually.`,
                'warning',
                'run',
            );
            return undefined;
        }

        switch (result.status) {
            case 'unique': {
                const stored = this.setPartStudioTarget(result.target);
                const name = result.element.name != null && result.element.name !== ''
                    ? ` "${result.element.name}"`
                    : '';
                this.reportMessage(
                    `Auto-selected the single Part Studio${name} (${stored.eid}) in the active document as the run target.`,
                    'info',
                    'run',
                );
                return stored;
            }
            case 'none':
                this.reportMessage(
                    'No Part Studio found in the active document (0 found); choose the Part Studio target manually.',
                    'warning',
                    'run',
                );
                return undefined;
            case 'ambiguous': {
                const list = result.elements.map((el) => `${el.name ?? el.id} (${el.id})`).join(', ');
                this.reportMessage(
                    `${result.count} Part Studios found in the active document (${list}); choose which one to run into.`,
                    'warning',
                    'run',
                );
                return undefined;
            }
        }
    }

    /**
     * Insert the generated feature into the configured Part Studio (#2).
     *
     * `feature` is what `describeGeneratedFeature()` produced from the graph:
     * the feature type, a display name and a value per declared parameter. The
     * namespace is resolved from the Feature Studio target, never from the Part
     * Studio target, and every failure is reported through `reportMessage()`.
     */
    public async insertPartStudioFeature(feature: FeatureInsertion): Promise<InsertOutcome> {
        const inserter = new PartStudioFeatureInserter({
            partStudioApi: this.onshape?.partStudioApi,
            featureStudioApi: this.onshape?.featureStudioApi,
            getDefiningTarget: () => this.getFeatureStudioTarget(),
            getConsumerTarget: () => this.getPartStudioTarget(),
            // The inserter's per-step messages stay parent-frame bubbles (#1's
            // path); the *outcome* is recorded once, below, as a typed run entry
            // so #4's panel gets the source tag and the detail block without
            // duplicate lines for the same event.
            notify: (message) => this.clientMessaging?.showMessageBubble(message),
        });
        const outcome = await inserter.insert(feature);
        this.reportInsertOutcome(outcome);
        return outcome;
    }

    public processUserInfo(): void {
        this.userinfo.init().then(() => {
            this.userinfo.getUserSettings().then((settings) => {
                if (settings == null) {
                    // something isn't right here
                    console.error("something went wrong");
                }
                console.log(settings);
                // do stuff with settings
                // this.userinfo.setUserSettings(settings).then(() => {
                //     this.userinfo.getUserSettings().then((res) => {
                //         console.log(res)
                //     })
                // })
            });
        })
    }

    public startVueApp(developerMode: boolean = false): void {
        this.developerMode = developerMode;
        this.clientMessaging?.setDeveloperMode(developerMode);
        const tryMount = () => {
            if (!document.getElementById('app')) {
                requestAnimationFrame(tryMount);
                return;
            }
            const vueApp = createApp(AppRoot);

            vueApp.provide('app', this);
            vueApp.provide('developerMode', developerMode);
            vueApp.directive('tooltip', tooltipDirective);


            vueApp.mount('#app');

            // this.messaging.showMessageBubble("App initialized")
        };
        tryMount();
    }

    public getStandardLibrary(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.onshape.documentApi.getDocument({ did: STD.DOCUMENT_ID }).then((res) => {
                if (res == null || res?.defaultWorkspace?.id == null) {
                    resolve(undefined);
                    return;
                }
                this.onshape.featureStudioApi.getFeatureStudioSpecs({
                    did: STD.DOCUMENT_ID,
                    wvm: 'w',
                    wvmid: res.defaultWorkspace.id,
                    eid: '6e648f0784c53a069512657b'
                }).then((res) => {
                    console.log(res);
                })
            })
        })
    }

    /**
     * DR-001: check a loaded graph for nodes that depend on a live selection.
     *
     * Called after deserializing a graph (#6 wires Save/Open). The schema-v1
     * writer never persists a selection, so this is a guard against documents
     * that arrive some other way — hand-edited, written by an older build, or by
     * a future change that starts persisting one. Each finding is shown once as a
     * message bubble, and the messages are returned for the caller/log.
     */
    public checkGraphForLiveSelection(graph: unknown): string[] {
        const warnings = describeLiveSelectionDependencies(graph);
        for (const warning of warnings) {
            // Also in the panel; the deduplication lives in the guard, so this
            // loop can only ever see each finding once.
            this.reportMessage(warning, 'warning', 'editor');
        }
        return warnings;
    }
}