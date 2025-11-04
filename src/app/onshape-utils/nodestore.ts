/**
 * Copyright 2025 William Degele
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