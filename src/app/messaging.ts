/**
 * BSD 3-Clause License

Copyright (c) 2023, John Toebes

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * Source: https://github.com/Team2901/OnshapeInsertTool/blob/main/app/messaging.ts
 */

export interface Selection {
    entityType: string;
    occurencePath: string[];
    selectionID: string;
    selectionType: string;
    workspaceMicroversionId: string;
}

class Messaging {
    selections: Selection[];

    documentId: string;
    workspaceId: string;
    elementId: string;
    public server = 'https://cad.onshape.com';

    constructor(documentId: string, workspaceId: string, elementId: string) {
        this.documentId = documentId;
        this.workspaceId = workspaceId;
        this.elementId = elementId;

        this.ListenForAppClicks();
        this.AddPostMessageListener();
        this.sendInitMessage();
    }

    showMessageBubble(message: string) {
        let data = {
            documentId: this.documentId,
            workspaceId: this.workspaceId,
            elementId: this.elementId,
            messageName: 'showMessageBubble',
            message
        }

        window.parent.postMessage(data, '*');
    }

    /**
     * Notify Onshape that we have initialized and are ready to do work
     * See: https://onshape-public.github.io/docs/clientmessaging/
     */
    public sendInitMessage() {
        const message = {
            documentId: this.documentId,
            workspaceId: this.workspaceId,
            elementId: this.elementId,
            messageName: 'applicationInit',
        };

        console.log('Posting message: %o', message);
        window.parent.postMessage(message, '*');
    }
    /**
     * Add a listener for any post messages from Onshape.  When they come in,
     * they will be redirected to the handlePostmessage handler.
     */
    public AddPostMessageListener() {
        window.addEventListener(
            'message',
            (event: Event) => {
                this.handlePostMessage(event as MessageEvent<any>);
            },
            false
        );
    }
    /**
     * Listen for clicks in our application and post a message to the Onshape client
     */
    public ListenForAppClicks() {
        const topelement = document.getElementById('top');
        if (topelement !== null) {
            topelement.addEventListener(
                'click',
                () => {
                    // console.log('clicked!');
                    let message = {
                        documentId: this.documentId,
                        workspaceId: this.workspaceId,
                        elementId: this.elementId,
                        messageName: 'closeFlyoutsAndMenus',
                    };
                    // console.log('Posting message: %o', message);
                    window.parent.postMessage(message, '*');
                },
                true
            );
        }
    }
    /**
     * Handle any post messages sent to us
     * @param e Event message
     */
    public handlePostMessage(e: MessageEvent<any>): any {
        console.log('Post message received in application extension.');
        console.log('e.origin = ' + e.origin);

        // Verify the origin matches the server iframe src query parameter
        if (this.server === e.origin) {
            console.log(
                "Message safe and can be handled as it is from origin '" +
                e.origin +
                "', which matches server query parameter '" +
                this.server +
                "'."
            );
            if (e.data && e.data.messageName) {
                console.log("Message name = '" + e.data.messageName + "'");
            } else {
                console.log('Message name not found. Ignoring message.');
            }
        } else {
            console.log('Message NOT safe and should be ignored.');
        }
    }
}
export { Messaging }