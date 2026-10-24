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
import { FeatureStudioUploader, UploadOutcome } from "./onshape-utils/featurestudioupload";
import {
    FeatureInsertion,
    InsertOutcome,
    PartStudioFeatureInserter,
    PartStudioTarget,
    PartStudioTargetSettings,
} from "./onshape-utils/partstudiofeature";

export class App extends BaseApp {
    public myserver = 'https://onshape-node-editor-function.azurewebsites.net';
    public myclient = 'https://williambagel.github.io/onshape-node-editor';
    public userinfo!: UserInfo;
    public developerMode = false;
    /**
     * #1: persisted Feature Studio target. `UserSettings.featureStudioTarget` is
     * the same type and is where #6 will migrate it once Save/Open exists; the
     * target lives in browser storage today because `UserInfo.init()` only
     * resolves inside an embedded Onshape session.
     */
    public featureStudioTargets = new FeatureStudioTargetSettings(browserStorage() ?? new MemoryStorage());
    /**
     * #2: the Part Studio the generated feature is inserted into. A separate
     * field (and a separate storage key) from the Feature Studio target: the
     * defining element and the consumer element are different documents tabs,
     * and mixing them up is the defect the issue warns about.
     */
    public partStudioTargets = new PartStudioTargetSettings(browserStorage() ?? new MemoryStorage());
    /**
     * Confirmation for overwriting a non-empty Feature Studio. Replaceable so a
     * real dialog (once the UI has one) or a test can stand in for `confirm()`.
     */
    public confirmUpload: (diffText: string) => boolean = (diffText) => {
        if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
            return false;
        }
        return window.confirm(diffText);
    };

    public start(): void {
        this.userinfo = new UserInfo(this.onshape);

        this.startVueApp(this.developerMode);

        this.processUserInfo();

        this.getStandardLibrary();
    }

    /* --- #1: Feature Studio upload target ------------------------------- */

    /** The persisted upload target, or `undefined` when none is set. */
    public getFeatureStudioTarget(): FeatureStudioTarget | undefined {
        return this.featureStudioTargets.get();
    }

    /** Persist a target from a typed object or its `did=...&wvm=...` string form. Throws when invalid. */
    public setFeatureStudioTarget(target: FeatureStudioTarget | string): FeatureStudioTarget {
        const stored = this.featureStudioTargets.set(target);
        this.reportMessage(`Feature Studio target set to ${formatTarget(stored)}`);
        return stored;
    }

    /**
     * A starting point for the target prompt: this document, its default
     * workspace, and no element id (the Feature Studio has to be picked).
     */
    public suggestFeatureStudioTarget(): string {
        return `did=${this.documentId ?? ''},wvm=w,wvmid=${this.workspaceId ?? ''},eid=`;
    }

    /** Show a message through the existing client-messaging path (#4 owns the real log panel). */
    public reportMessage(message: string): void {
        if (message == null || message === '') return;
        this.clientMessaging?.showMessageBubble(message);
    }

    /**
     * Upload the generated FeatureScript to the configured Feature Studio.
     *
     * `source` is the string `generateFeatureStudioSource()` returned; it is
     * handed to Onshape byte-for-byte. Returns the outcome so the caller (and
     * tests) can tell "wrote", "already up to date" and "refused" apart.
     */
    public uploadFeatureStudio(source: string | undefined): Promise<UploadOutcome> {
        const uploader = new FeatureStudioUploader({
            api: this.onshape?.featureStudioApi,
            getTarget: () => this.getFeatureStudioTarget(),
            notify: (message) => this.reportMessage(message),
            confirm: (diffText) => this.confirmUpload(diffText),
        });
        return uploader.upload(source);
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
     * Insert the generated feature into the configured Part Studio (#2).
     *
     * `feature` is what `describeGeneratedFeature()` produced from the graph:
     * the feature type, a display name and a value per declared parameter. The
     * namespace is resolved from the Feature Studio target, never from the Part
     * Studio target, and every failure is reported through `reportMessage()`.
     */
    public insertPartStudioFeature(feature: FeatureInsertion): Promise<InsertOutcome> {
        const inserter = new PartStudioFeatureInserter({
            partStudioApi: this.onshape?.partStudioApi,
            featureStudioApi: this.onshape?.featureStudioApi,
            getDefiningTarget: () => this.getFeatureStudioTarget(),
            getConsumerTarget: () => this.getPartStudioTarget(),
            notify: (message) => this.reportMessage(message),
        });
        return inserter.insert(feature);
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
            this.clientMessaging?.showMessageBubble(warning);
        }
        return warnings;
    }
}