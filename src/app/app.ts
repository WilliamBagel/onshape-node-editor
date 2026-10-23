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

export class App extends BaseApp {
    public myserver = 'https://onshape-node-editor-function.azurewebsites.net';
    public myclient = 'https://williambagel.github.io/onshape-node-editor';
    public userinfo!: UserInfo;
    public developerMode = false;

    public start(): void {
        this.userinfo = new UserInfo(this.onshape);

        this.startVueApp(this.developerMode);

        this.processUserInfo();

        this.getStandardLibrary();
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