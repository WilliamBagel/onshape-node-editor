/**
 * BSD 3-Clause License
 * 
 * Copyright (c) 2023, John Toebes
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * Source: https://github.com/Team2901/OnshapeInsertTool/blob/main/app/messaging.ts
 */

import { TransientSelection } from "./featurescripttypes";

/**
 * Improvements made by William Degele, 2026
 */

type MessageCallback = (info: any[]) => boolean;
type SelectionFailureCallback = (reason: string) => void;

interface PendingSelectionRequest {
    entityType: string[];
    callback: MessageCallback;
    count?: number;
    controlId?: string;
    onError?: SelectionFailureCallback;
}

export class ClientMessaging {
    public selections!: TransientSelection[];

    public readonly documentId: string;
    public readonly workspaceId: string;
    public readonly elementId: string;
    public readonly server = 'https://cad.onshape.com';

    private stopMessagePromise: PromiseWithResolvers<void> | null = null;

    private requestSelectionMessageId: string | null = null;
    private requestSelectionCallback: MessageCallback | null = null;
    private requestSelectionOnError: SelectionFailureCallback | null = null;
    private requestSelectionDelivered = false;
    /** True between sending `stopRequest` and receiving the matching `STOP`. */
    private stoppingSelection = false;
    /** Latest request made while one was in flight; dispatched on `STOP`. */
    private queuedSelectionRequest: PendingSelectionRequest | null = null;
    private failureReporter: SelectionFailureCallback | null = null;

    /** Whether the app is running in developer/debug mode. Retained for
     * compatibility; DR-001 (issue #29 amendment) no longer gates
     * `requestSelection` on it — selection is an authoring gesture, never
     * persisted, with or without developer mode. */
    public developerMode = false;

    constructor(documentId: string, workspaceId: string, elementId: string) {
        this.documentId = documentId;
        this.workspaceId = workspaceId;
        this.elementId = elementId;

        this.registerMessageListener();
        this.sendInitMessage();
    }

    /** Sets developer mode (retained for compatibility; no longer gates selection) */
    public setDeveloperMode(enabled: boolean): void {
        this.developerMode = enabled;
    }

    /** No-op retained for compatibility: the DR-001 developer-mode warning
     * tracker was removed by the issue #29 amendment. */
    public clearWarningTracker(): void {
    }

    /**
     * Optional sink for selection failures (failed send, aborted/superseded
     * request). The caller wires this to the log store (`App.reportMessage`,
     * which writes to `BuildLogStore`); per-request `onError` callbacks are
     * also invoked. Failures are never reported by calling the success
     * callback with `[]`.
     */
    public setFailureReporter(reporter: SelectionFailureCallback | null): void {
        this.failureReporter = reporter;
    }

    private reportSelectionFailure(reason: string, onError?: SelectionFailureCallback | null): void {
        const callback = onError ?? this.requestSelectionOnError;
        try { callback?.(reason); } catch { /* a failing reporter must not break messaging */ }
        if (callback !== this.failureReporter) {
            try { this.failureReporter?.(reason); } catch { /* see above */ }
        }
    }

    public showMessageBubble(message: string) {
        this.sendMessage({
            messageName: 'showMessageBubble',
            message
        });
    }

    /**
     * Authoring gesture under DR-001 (docs/design-rules.md, issue #29
     * amendment): selections are transient (microversion-bound), do not survive
     * document edits, only work while embedded, and bypass parameter filters.
     * Consume the result to produce a reconstructible query; never persist a
     * live selection or build production node behavior on it.
     *
     * Re-entrant safe (issue #29): exactly one request is in flight at a time.
     * A call made while one is pending does not send immediately — it queues
     * (latest wins), sends one `stopRequest`, and is dispatched only when the
     * matching `STOP` arrives. The superseded request's `onError` is invoked
     * with an abort reason and its success callback is never called with `[]`.
     * @param controlId Unique identifier for the calling control (retained for
     * compatibility; no longer used for warning deduplication).
     * @param onError Optional failure callback, wired by callers to the log
     * store so a failed/aborted request is reported, not silently dropped.
     */
    public requestSelection(entityType: string[], callback: MessageCallback, count?: number, controlId?: string, onError?: SelectionFailureCallback) {
        const request: PendingSelectionRequest = { entityType, callback, count, controlId, onError };

        if (this.requestSelectionMessageId !== null || this.stoppingSelection) {
            const supersededQueued = this.queuedSelectionRequest;
            this.queuedSelectionRequest = request;
            if (supersededQueued?.onError != null) {
                this.reportSelectionFailure(
                    'Selection request superseded by a newer request before it was sent.',
                    supersededQueued.onError,
                );
            }
            if (!this.stoppingSelection) {
                this.stopRequest();
            }
            return;
        }

        this.dispatchSelectionRequest(request);
    }

    private dispatchSelectionRequest(request: PendingSelectionRequest): void {
        const id = crypto.randomUUID();
        this.requestSelectionMessageId = id;
        this.requestSelectionCallback = request.callback;
        this.requestSelectionOnError = request.onError ?? null;
        this.requestSelectionDelivered = false;
        let sent = false;
        try {
            sent = this.sendMessage({
                messageName: 'requestSelection',
                messageId: id,
                entityTypeSpecifier: request.entityType,
                requiredSelectionCount: request.count
            });
        } catch (error) {
            this.clearSelectionInFlight();
            this.reportSelectionFailure(
                `Selection request failed to send: ${error instanceof Error ? error.message : String(error)}`,
                request.onError ?? null,
            );
            return;
        }
        if (!sent) {
            this.clearSelectionInFlight();
            this.reportSelectionFailure('Selection request failed to send.', request.onError ?? null);
        }
    }

    private clearSelectionInFlight(): void {
        this.requestSelectionMessageId = null;
        this.requestSelectionCallback = null;
        this.requestSelectionOnError = null;
        this.requestSelectionDelivered = false;
    }

    public stopRequest() {
        if (this.requestSelectionMessageId === null && this.stopMessagePromise != null) {
            return;
        }
        this.stoppingSelection = true;
        this.sendMessage({ messageName: 'stopRequest' });
        this.stopMessagePromise = Promise.withResolvers();
    }

    public requestSelectionHighlight(selections: Array<{
        "selectionType": string,
        "selectionId": string,
        "entityType": string
    }>) {
        this.sendMessage({
            messageName: 'requestSelectionHighlight',
            messageId: crypto.randomUUID(),
            selections
        })
    }

    /**
     * Notify Onshape that we have initialized and are ready to do work
     * See: https://onshape-public.github.io/docs/clientmessaging/
     */
    private sendInitMessage() {
        this.sendMessage({
            messageName: 'applicationInit'
        });
    }

    /**
     * Add a listener for any post messages from Onshape.  When they come in,
     * they will be redirected to the handlePostmessage handler.
     */
    private registerMessageListener() {
        window.addEventListener('message', (event: Event) => { this.handleRecievedMessage(event as MessageEvent<any>); }, false);
    }

    /**
     * Handle any post messages sent to us
     * @param event Event message
     */
    private handleRecievedMessage(event: MessageEvent<any>): void {
        console.log('Post message received in application extension.');
        console.log('e.origin = ' + event.origin);

        // Verify the origin matches the server iframe src query parameter
        if (this.server !== event.origin) { return; }

        console.log("Message safe and can be handled as it is from origin '" + event.origin + "', which matches server query parameter '" + this.server + "'.");

        const messageType = event.data?.messageName;

        if (messageType == null) {
            console.log('Message name not found. Ignoring message.');
            return;
        }

        console.log("Message name = '" + event.data.messageName + "'");

        if (messageType === 'SELECTION') {
            console.log('SELECTION event data: %o', event.data);
            this.selections = event.data?.selections;
            // A SELECTION for a request that is being stopped belongs to the
            // superseded request: do not deliver it to its callback (which
            // was already told it aborted) and do not treat the queued
            // request as fulfilled. It is dispatched on STOP.
            if (this.stoppingSelection || this.requestSelectionMessageId === null) {
                return;
            }
            this.requestSelectionDelivered = true;
            this.requestSelectionCallback?.(event.data?.selections);
        } else if (messageType === 'STOP') {
            const inFlightOnError = this.requestSelectionOnError;
            const delivered = this.requestSelectionDelivered;
            this.stoppingSelection = false;
            this.clearSelectionInFlight();
            this.stopMessagePromise?.resolve();
            this.stopMessagePromise = null;
            if (!delivered && inFlightOnError != null) {
                // Stopped before any selection arrived: aborted, not an
                // empty success. The success callback is not called.
                this.reportSelectionFailure('Selection request was stopped before a selection arrived.', inFlightOnError);
            }
            const queued = this.queuedSelectionRequest;
            this.queuedSelectionRequest = null;
            if (queued != null) {
                this.dispatchSelectionRequest(queued);
            }
        }

        else {
            console.debug(`${event.data.messageName} not handled`);
        }
    }

    /**
     * Sends message to onshape with this document, workspace, element info
     * @param message any message object 
     * @returns valid send message request
     */
    private sendMessage(message: { messageName: string, [key: string]: any }): boolean {
        if (message.messageName == null) {
            return false;
        }

        const data = Object.assign({
            documentId: this.documentId,
            workspaceId: this.workspaceId,
            elementId: this.elementId,
        }, message);

        console.log('Posting message: %o', data);

        window.parent.postMessage(data, '*');
        return true;
    }
}
