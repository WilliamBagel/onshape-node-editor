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

/**
 * Improvements made by William Degele, 2026
 */

export interface OnshapeSelection {
    entityType: string;
    occurencePath: string[];
    selectionID: string;
    selectionType: string;
    workspaceMicroversionId: string;
}

type MessageCallback = (info: any[]) => boolean;

export class ClientMessaging {
    public selections!: OnshapeSelection[];

    public readonly documentId: string;
    public readonly workspaceId: string;
    public readonly elementId: string;
    public readonly server = 'https://cad.onshape.com';

    private stopMessagePromise: PromiseWithResolvers<void> | null = null;

    private requestSelectionMessageId: string | null = null;
    private requestSelectionCallback: MessageCallback | null = null;

    constructor(documentId: string, workspaceId: string, elementId: string) {
        this.documentId = documentId;
        this.workspaceId = workspaceId;
        this.elementId = elementId;

        this.registerMessageListener();
        this.sendInitMessage();
    }

    public showMessageBubble(message: string) {
        this.sendMessage({
            messageName: 'showMessageBubble',
            message
        });
    }

    public requestSelection(entityType: string[], callback: MessageCallback, count?: number) {
        if (this.requestSelectionMessageId !== null) {
            this.stopRequest();
            this.stopMessagePromise?.promise.then(() => {
                this.requestSelectionMessageId = null;
                this.requestSelectionCallback = null;
                this.requestSelection(entityType, callback, count);
            });
        }

        const id = crypto.randomUUID();
        this.requestSelectionMessageId = id;
        this.requestSelectionCallback = callback;
        this.sendMessage({
            messageName: 'requestSelection',
            messageId: crypto.randomUUID(),
            entityTypeSpecifier: entityType,
            requiredSelectionCount: count
        });
    }

    public stopRequest() {
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
            this.requestSelectionCallback?.(event.data?.selections);
        } else if (messageType === 'STOP') {
            this.stopMessagePromise?.resolve();
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
