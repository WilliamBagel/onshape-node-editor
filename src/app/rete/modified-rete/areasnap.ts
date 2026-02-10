import { BaseSchemes } from 'rete'
import { BaseArea, BaseAreaPlugin } from 'rete-area-plugin'

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
 * Modified by William Degele to allow a callback for conditionally snapping to grid
 */

/**
 * Snap grid extension parameters
 */
export type Params = {
    /** The grid size */
    size?: number
    /** Whether to snap on node drag */
    dynamic?: boolean,
    /** Callback to check whether to snap */
    allowed?: () => boolean
}

/**
 * Snap grid extension
 * @param base The base area plugin
 * @param params The snap parameters
 * @listens nodetranslate
 * @listens nodedragged
 */
export function snapGrid<Schemes extends BaseSchemes, K>(base: BaseAreaPlugin<Schemes, K>, params?: Params) {
    const area = base as BaseAreaPlugin<Schemes, BaseArea<Schemes>>
    const size = typeof params?.size === 'undefined'
        ? 16
        : params.size
    const dynamic = typeof params?.dynamic === 'undefined'
        ? true
        : params.dynamic
    const allowedCallback = typeof params?.allowed === 'function'
        ? params.allowed
        : () => true;

    function snap(value: number) {
        if (allowedCallback() !== true) {
            return value;
        }
        return Math.round(value / size) * size
    }

    area.addPipe(context => {
        if (!context || typeof context !== 'object' || !('type' in context)) return context;
        if (dynamic && context.type === 'nodetranslate') {
            const { position } = context.data;
            const x = snap(position.x);
            const y = snap(position.y);

            return {
                ...context,
                data: {
                    ...context.data,
                    position: { x, y }
                }
            }
        }
        if (!dynamic && context.type === 'nodedragged') {
            const view = area.nodeViews.get(context.data.id)

            if (view) {
                const { x, y } = view.position

                void view.translate(snap(x), snap(y))
            }
        }
        return context
    })
}