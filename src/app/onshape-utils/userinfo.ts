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
import { AppStorage } from "./appstorage";
import { NodeStore } from "./nodestore";

const USERINFO_SYMBOL = 'ⓘ';
const USERINFO_NAME = "Onshape-Node-Editor_UserInfo"
const USERINFO_ELEMENTNAME = "User Info"

export type UserSettings = {
    createdDate: string,
    nodestores: NodeStore[];
}

export class UserInfo extends AppStorage<UserSettings> {

    constructor(onshape: OnshapeAPI) {
        super(onshape);
    }

    public async init(did?: string, eid?: string) {
        if (did == null) {
            await this._initAsSingleton(USERINFO_ELEMENTNAME);
            return
        }
        await this._initFromExisting(did, eid, USERINFO_ELEMENTNAME);
    }

    public getUserSettings(): Promise<UserSettings> {
        return new Promise((resolve, reject) => {
            this._getData().then((res) => {
                resolve(res);
            })
        })
    }

    public setUserSettings(settings: UserSettings): Promise<void> {
        return new Promise((resolve, reject) => {
            this._setData(settings).then((res) => {
                resolve();
            })
        })
    }

    protected override _getDocumentName(): string {
        return USERINFO_SYMBOL + ' ' + USERINFO_NAME + ' ' + USERINFO_SYMBOL;
    }

    protected override _getInitialData(): UserSettings {
        return {
            createdDate: new Date().toDateString(),
            nodestores: []
        }
    }
}