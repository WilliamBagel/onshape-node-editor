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

const FORMAT_ID = 'github.williambagel.onshape-node-editor'

import { BTAppElementModifyInfo, BTAppElementParams, BTAppElementUpdateParamsReturnJsonDifferenceFormatEnum, BTDocumentElementCreationDescriptor, BTDocumentElementInfo, BTDocumentElementProcessingInfo, BTDocumentInfo, BTJEdit3734 } from "onshape-typescript-fetch";
import { OnshapeAPI } from "../common/onshapeapi";
import { DocumentSummary } from "./documentinfo";

export class AppStorage<Data> {
    public onshape: OnshapeAPI
    protected documentId: string;
    protected workspaceId: string;
    protected elementId: string;
    protected documentInfo: BTDocumentInfo;
    protected lastElements: BTDocumentElementInfo[]

    /**
     * Create a new app storage element
     * @param onshape onshape api instance
     */
    constructor(onshape: OnshapeAPI) {
        this.onshape = onshape;
    }

    /**
     * Create a app store element in a new document
     * @param documentName name of new document
     * @returns 
     */
    protected _initNew(documentName: string, elementName: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            await this._createDocument(documentName, elementName);
            resolve();
        })
    }

    /**
    * Create app storage element in an existing document
    * if the eid is null, then a new element will be created with elementName
    * @param did document id
    * @param eid element id
    * @param elementName element name
    */
    protected _initFromExisting(did: string, eid: string, elementName: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            this.documentId = did;
            if (this.documentInfo == null) {
                await this._fetchDocumentInfo();
            }

            if (eid == null) {
                const element = await this._getElement(elementName);
                if (element == null) {
                    const appElementInfo = await this._createAppElement(elementName);
                    this.elementId = appElementInfo.elementId;
                } else {
                    this.elementId = element.id;
                }
            } else {
                this.elementId = eid;
            }
            resolve();
        })
    }

    /**
     * Create a app storage element with name by first searching for it in user-created documents,
     * then creating a new document if the existing one cannot be found
     * name of document comes from overrided _getDocumentName method
     * @param elementName the default name of the first element
     * @returns 
     */
    protected _initAsSingleton(elementName: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            const documentSummary = await this._fetchDocumentSummary();

            if (documentSummary == null) {
                await this._initNew(this._getDocumentName(), elementName);
            } else {
                this.documentId = documentSummary.id;
                await this._fetchDocumentInfo();
                await this._initFromExisting(this.documentId, undefined, elementName);
            }

            resolve();
        })
    }


    protected _fetchDocumentElements(): Promise<BTDocumentElementInfo[]> {
        return new Promise((resolve, reject) => {
            this.onshape.documentApi.getElementsInDocument({
                did: this.documentId,
                wvm: "w",
                wvmid: this.workspaceId
            }).then((res) => {
                if (res == null) {
                    // something isn't right here
                    console.error("something went wrong");
                }
                resolve(res);
                this.lastElements = res;
            })
        })
    }

    protected async _setData(data: Data): Promise<void> {
        return await this._setAppElement(this.elementId, undefined, data);
    }

    protected _setAppElement(eid: string, fallbackName: string, data: Data): Promise<void> {
        return new Promise((resolve, reject) => {
            let elementName: string;
            if (this.lastElements == null) {
                this._fetchDocumentElements().then(() => {
                    // try again
                    resolve(this._setAppElement(eid, fallbackName, data));
                })
                return;
            }
            for (let element of this.lastElements) {
                if (element.id === eid) {
                    elementName = element.name || element.filename;
                }
            }
            if (elementName == null) {
                // brugh
                elementName = fallbackName;
            }

            // const json: any = JSON.stringify(data);
            this.__setWithJSONPatch(data).then(() => {
                resolve();
            })
        })
    }

    /**
     * 
     * This method is used because it only require one request
     * https://jsonpatch.com/
     */
    private __setWithJSONPatch(data: Data): Promise<void> {
        return new Promise((resolve, reject) => {
            this.onshape.appElementApi.updateAppElement({
                did: this.documentId,
                eid: this.elementId,
                wvm: "w",
                wvmid: this.workspaceId,
                bTAppElementUpdateParams: {
                    jsonPatch: JSON.stringify([
                        {
                            "op": "replace",
                            "path": "",
                            "value": data
                        }
                    ])
                }
            }).then((res) => {
                if (res == null) {
                    console.error("something isn't right here");
                    resolve(undefined);
                }
                resolve();
            });
        })
    }

    /**
     * This method is not used due to requiring 3 requests,
     * however it would be better for collaborative applications, 
     * and applications with version built in version trees (that 
     * would mirror onshape's version tree)
     */
    private __setWithJSONTreeEdit(edit: BTJEdit3734): Promise<void> {
        return new Promise((resolve, reject) => {
            this.onshape.appElementApi.startTransaction({
                did: this.documentId,
                eid: this.elementId,
                wid: this.workspaceId,
                bTAppElementStartTransactionParams: {
                    // description: "";
                    /**
                     * 
                     * @type {string}
                     * @memberof BTAppElementStartTransactionParams
                     */
                    // parentChangeId?: string;
                    /**
                     * 
                     * @type {boolean}
                     * @memberof BTAppElementStartTransactionParams
                     */
                    returnError: true
                }
            }).then((res) => {
                if (res == null) {
                    console.error("something isn't right here");
                    resolve(undefined)
                    return;
                }
                const transactionId = res.transactionId;
                this.onshape.appElementApi.updateAppElement({
                    did: this.documentId,
                    eid: this.elementId,
                    wvm: "w",
                    wvmid: this.workspaceId,
                    bTAppElementUpdateParams: {
                        jsonTreeEdit: edit,
                        returnJsonDifferenceFormat: BTAppElementUpdateParamsReturnJsonDifferenceFormatEnum.JsonPatch,
                        transactionId
                    }
                }).then((res) => {
                    if (res == null) {
                        console.error("something isn't right here");
                        resolve(undefined);
                    }
                    this.onshape.appElementApi.commitTransactions({
                        did: this.documentId,
                        wid: this.workspaceId,
                        bTAppElementCommitTransactionParams: {
                            allowMerge: true,
                            /**
                             * The label that will appear in the document's edit history for this operation. If blank, a value will be auto-generated.
                             * @type {string}
                             * @memberof BTAppElementCommitTransactionParams
                             */
                            description: "",
                            /**
                             * 
                             * @type {boolean}
                             * @memberof BTAppElementCommitTransactionParams
                             */
                            returnError: true,
                            /**
                             * 
                             * @type {Array<string>}
                             * @memberof BTAppElementCommitTransactionParams
                             */
                            transactionIds: [res.transactionId]
                        }
                    }).then((res) => {
                        if (res == null) {
                            console.error("Commit transactions failed");
                        }
                        resolve()
                    })
                })
            })
        })
    }

    private async _getElement(elementName?: string): Promise<BTDocumentElementInfo> {
        const elements = await this._fetchDocumentElements();
        let element: BTDocumentElementInfo;
        if (elementName == null) {
            return elements[0];
        }
        for (const elem of elements) {
            if (elem.name === elementName) {
                element = elem;
                break;
            }
        }
        return element;
    }

    private _fetchDocumentSummary(name?: string, offset: number = 0): Promise<DocumentSummary> {
        const limit = 50
        return new Promise((resolve, reject) => {
            const documentName = name || this._getDocumentName();
            this.onshape.globalTreeNodesApi.globalTreeNodesMagic({
                mid: "2",
                getPathToRoot: false,
                offset,
                limit,
                includeParts: false,
                includeSurfaces: false,
                includeSketches: false,
                includeReferenceFeatures: false,
                includeAssemblies: false,
                includeFeatureStudios: false,
                includeBlobs: false,
                // allowedBlobMimeTypes: "",
                includePartStudios: false,
                includeFeatures: false,
                includeWires: false,
                includeFlattenedBodies: false,
                includeApplications: true,
                // allowedApplicationMimeTypes: "",
                includeFSTables: false,
                includeFSComputedPartPropertyFunctions: false,
                includeVariables: false,
                includeVariableStudios: false,
                allowedBlobExtensions: "",
                excludeNewerFSVersions: false,
                includeMeshes: false,
                includeCompositeParts: false,
            }).then((res => {
                if (res == null) {
                    // no files or # of files are a multiple of the limit
                    // so user info doesn't exist yet
                    return resolve(undefined);
                }
                for (const item of res.items) {
                    if (item.name === documentName) {
                        return resolve(DocumentSummary.from(item));
                    }
                }
                if (res.items.length === limit) {
                    return resolve(this._fetchDocumentSummary(name, offset + limit));
                }
                // user info doesn't exist yet
                resolve(undefined);
            })).catch((err) => {
                console.log(err)
                resolve(undefined);
            })
        })
    }

    public getDocumentInfo(): BTDocumentInfo {
        return this.documentInfo;
    }

    private _fetchDocumentInfo(): Promise<BTDocumentInfo> {
        return new Promise((resolve, reject) => {
            this.onshape.documentApi.getDocument({
                did: this.documentId
            }).then((res) => {
                if (res == undefined) {
                    // something isn't right here
                    console.error("something went wrong");
                }
                this.documentInfo = res;
                this.documentId = res.id;
                this.workspaceId = res.defaultWorkspace?.id;
                resolve(res);
            })
        })
    }

    private _createDocument(name?: string, elementName?: string): Promise<BTDocumentInfo> {
        return new Promise((resolve, reject) => {
            let defaultElement: BTDocumentElementCreationDescriptor;
            if (elementName) {
                defaultElement = {
                    elementParams: this.__getDefaultAppElementParams(),
                    elementType: 5
                };
            }

            this.onshape.documentApi.createDocument({
                bTDocumentParams: {
                    name: name || this._getDocumentName(),
                    // description: "",
                    elements: [defaultElement],
                    ownerType: 0,
                    // isEmptyContent: true,
                    isPublic: false,
                    // notRevisionManaged: false,
                    // ownerId: ""
                    // tags: ["onshape-node-editor"]
                }
            }).then((res) => {
                if (res == null) {
                    // something went wrong
                    console.error("something went wrong");
                    resolve(undefined);
                    return;
                }
                this.documentInfo = res;
                this.documentId = res.id;
                this.workspaceId = res.defaultWorkspace?.id
                const defaultElementId = res.defaultElementId;
                if (defaultElementId == null) {
                    this._getElement().then((element) => {
                        if (element == null) {
                            // something isn't right here
                            console.error("something went wrong")
                        }
                        this.elementId = element.id;
                        console.log("element id set from new document", element, this.elementId)
                        resolve(res);
                    })
                } else {
                    resolve(res);
                }
            })

        })
    }

    private _createAppElement(elementName: string): Promise<BTAppElementModifyInfo> {
        return new Promise((resolve, reject) => {
            this.onshape.appElementApi.createElement({
                did: this.documentId,
                wid: this.workspaceId,
                bTAppElementParams: this.__getDefaultAppElementParams(elementName)
            }).then((res) => {
                if (res == null) {
                    // something isn't right here
                    console.error("something went wrong");
                }
                this.elementId = res.elementId;
                resolve(res)
            })
        })
    }

    protected _getData(): Promise<Data> {
        return new Promise((resolve, reject) => {
            console.log(this.elementId)
            this.onshape.appElementApi.getJson({
                did: this.documentId,
                wvm: "w",
                wvmid: this.workspaceId,
                eid: this.elementId
            }).then((res) => {
                if (res == undefined) {
                    // something isn't right here
                    console.error("something went wrong");
                    resolve(undefined);
                    return;
                }
                delete res.tree["_nodeId"];
                resolve(res.tree as Data);
            })
        })
    }

    private __getDefaultAppElementParams(elementName?: string): BTAppElementParams {
        return {
            // description: "",
            /**
             * The data type of the application. This string allows an application to distinguish their elements from elements of another application.
             * @type {string}
             * @memberof BTAppElementParams
             */
            formatId: FORMAT_ID,
            /**
             * Initialization data for the new element's json tree.
             * @type {object}
             * @memberof BTAppElementParams
             */
            jsonTree: this._getInitialData() as any,
            /**
             * 
             * @type {BTElementLocationParams}
             * @memberof BTAppElementParams
             */
            // location?: BTElementLocationParams;
            /**
             * The name of the element being created. If blank, a name will be auto-generated.
             * @type {string}
             * @memberof BTAppElementParams
             */
            name: elementName,
            /**
             * Initialization data for the new element's subelements.
             * @type {Array<BTAppElementChangeParams>}
             * @memberof BTAppElementParams
             */
            // subelements?: Array<BTAppElementChangeParams>;
        }
    }

    protected _getDocumentName(): string {
        return "";
    }

    protected _getInitialData(): Data {
        return undefined;
    }
}