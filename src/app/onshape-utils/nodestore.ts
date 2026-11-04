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

import { OnshapeAPI } from "../common/onshapeapi";
import { AppStorage } from "./appstorage"

export type NodeData = {
    reteJSON: string
}

export class NodeStore extends AppStorage<NodeData> {

    constructor(onshape: OnshapeAPI) {
        super(onshape)
    }

    public initNew(documentName: string, elementName: string): Promise<void> {
        return this._initNew(documentName, elementName);
    }

    public initFromExisting(did: string, eid: string, elementName: string): Promise<void> {
        return this._initFromExisting(did, eid, elementName);
    }

    public async getNodeData(): Promise<NodeData> {
        return await this._getData();
    }

    public async setNodeData(data: NodeData): Promise<void> {
        return await this._setData(data)
    }

    /**
     * #31: create the app element holding one graph's serialized form in an
     * already-known document/workspace (the active document), and return its
     * element id. Reuses `AppStorage._createAppElement`; it does not look the
     * graph up by name first, so creating a second graph never adopts the
     * first graph's element.
     */
    public async createGraphElement(did: string, wid: string, elementName: string): Promise<string> {
        this.documentId = did;
        this.workspaceId = wid;
        const info = await this._createAppElement(elementName);
        if (info?.elementId == null) {
            throw new Error(`Creating graph element "${elementName}" returned no element id.`);
        }
        this.elementId = info.elementId;
        return info.elementId;
    }

    // this can be done by by the instantiating code
    // public async init(did?: string, eid?: string, ) {
    //     if (did) {
    //         // we have already picked a document and element for this data
    //         await this.initFromExisting(did, eid, undefined);
    //         return;
    //     }else{
    //         // we need need to create a new document for this data
    //         await this.initNew()
    //     }
    // }

    protected override _getInitialData(): NodeData {
        return {
            reteJSON: ""
        }
    }
}