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
    FeatureStudioUploader,
    UploadOutcome,
} from "./onshape-utils/featurestudioupload";
import { BuildLogStore, type LogSeverity } from "./logging/buildlog";

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
     * #4: the build/upload/run log. Everything the pipeline reports lands here
     * and is rendered by `LogPanel.vue`; the panel is the only place those
     * outcomes are visible (the console is no longer the log).
     */
    public log = new BuildLogStore();
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

    /** #4: Run is still a stub; say so in the log instead of doing nothing. */
    public reportRunUnavailable(): void {
        this.log.add({
            severity: 'warning',
            source: 'run',
            message: 'Run is not implemented yet; nothing was executed. Use Upload to write the generated FeatureScript to a Feature Studio.',
        });
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
    public uploadFeatureStudio(source: string | undefined): Promise<UploadOutcome> {
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