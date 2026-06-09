import { SocketData } from "rete-connection-plugin";

export function sameSocket(s1: SocketData, s2: SocketData) {
    return s1.element === s2.element && s1.key === s2.key
        && s1.nodeId === s2.nodeId && s1.side === s2.side
        && s1.type === s2.type;
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
 * Alternative to document.elementsFromPoint that traverses shadow roots
 * @param x x coordinate
 * @param y y coordinate
 * @param root root element to search in
 */
export function elementsFromPoint(x: number, y: number, root: ShadowRoot | Document = document) {
    const elements = root.elementsFromPoint(x, y)
    const shadowRoot = elements[0]?.shadowRoot

    if (shadowRoot && shadowRoot !== root) {
        elements.unshift(...elementsFromPoint(x, y, shadowRoot))
    }

    return elements
}

/**
 * Modified version of findSocket in retejs connection-plugin
 * Will attempt to find element in socket cache, then try to find element's parent,
 *  if .socket-container, and its parent, which should be the in socket cache
 * Allows snapping box element to give the same result as socket element
*/
export function findSocket(socketsCache: WeakMap<Element, SocketData>, elements: Element[]): { element: Element, socket: SocketData } | undefined {
    let snapped: { element: Element, socket: SocketData }| undefined = undefined;
    for (const element of elements) {
        const found = socketsCache.get(element);

        if (found != null) {
            return { element, socket: found };
        }

        const container = element.parentElement;
        if (container != null && container instanceof HTMLElement &&
            container.classList.contains('socket-container') && container.parentElement) {
            const data = socketsCache.get(container.parentElement);
            if (data != null) {
                snapped = { element: container, socket: data };
            }
        }
    }
    return snapped;
}