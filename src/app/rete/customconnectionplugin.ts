import { ClassicScheme } from "rete-vue-plugin";
import { ConnectionSnappingPlugin } from "./connection-snapping/connectionsnapping";
import { BaseArea, BaseAreaPlugin } from "rete-area-plugin";
import { Position } from "rete-area-plugin/_types/types";
import { OnshapeSocketData } from "./types";
import { getUID } from "rete";
import { StyleSettings } from "./stylesettings";

export class CustomConnectionPlugin<Schemes extends ClassicScheme, K> extends ConnectionSnappingPlugin<Schemes, K> {
    constructor(styleSettings: StyleSettings) {
        super();
        this['preudoconnection'] = createPseudoconnection(styleSettings, { isPseudo: true } as any as Partial<Schemes['Connection']>)
    }
}

/**
 * MIT License
 *
 * Copyright (c) 2023 "Ni55aN" Vitaliy Stoliarov
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
*/

/**
 *  Modified by William Degele to include sourceType & targetType in payload
 *      from OnshapeSocketData.btType
 */

function createPseudoconnection<Schemes extends ClassicScheme, K>(styleSettings: StyleSettings, extra?: Partial<Schemes['Connection']>) {
    let element: HTMLElement | null = null
    let id: string | null = null

    function unmount(areaPlugin: BaseAreaPlugin<Schemes, BaseArea<Schemes> | K>) {
        if (id) {
            areaPlugin.removeConnectionView(id)
        }
        element = null
        id = null
    }
    function mount(areaPlugin: BaseAreaPlugin<Schemes, BaseArea<Schemes> | K>) {
        unmount(areaPlugin)
        id = `pseudo_${getUID()}`
    }

    return {
        isMounted() {
            return Boolean(id)
        },
        mount,
        render(areaPlugin: BaseAreaPlugin<Schemes, BaseArea<Schemes> | K>, { x, y }: Position, data: OnshapeSocketData) {
            const isOutput = data.side === 'output'
            const pointer = {
                x: x + (isOutput
                    ? -3
                    : 3),
                y
            } // fix hover of underlying elements

            if (!id) throw new Error('pseudo connection id wasn\'t generated')

            const payload = isOutput
                ? {
                    id,
                    source: data.nodeId,
                    sourceOutput: data.key,
                    sourceType: data.btType,
                    target: '',
                    targetInput: '',
                    targetType: '',
                    styleSettings,
                    ...extra ?? {}
                }
                : {
                    id,
                    target: data.nodeId,
                    targetInput: data.key,
                    targetType: data.btType,
                    source: '',
                    sourceOutput: '',
                    sourceType: '',
                    styleSettings,
                    ...extra ?? {}
                }

            if (!element) {
                const view = areaPlugin.addConnectionView(payload)

                element = view.element
            }

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!element) return

            void areaPlugin.emit({
                type: 'render',
                data: {
                    element,
                    type: 'connection',
                    payload,
                    ...isOutput
                        ? { end: pointer }
                        : { start: pointer }
                }
            })
        },
        unmount
    }
}