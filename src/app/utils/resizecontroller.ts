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

/**
 * Static class for use by resize handles
 * resizeBegin should be called when the handle is activated
 * resizeEnd should be called when the handle is deactivated
 * only one handle can be activated/receive movements events at one time
 */
export class ResizeController {
    private static onResize: (e: Event) => void = () => { }

    private static resizeActive = false;

    static {
        document.addEventListener('pointermove', ResizeController.pointermove, {passive: true});
        document.addEventListener('pointerleave', ResizeController.pointerleave);
        document.addEventListener('pointerup', ResizeController.pointerup);
    }

    public static resizeBegin(onResize: (e: Event) => void): void {
        ResizeController.onResize = onResize;
        ResizeController.resizeActive = true;
        document.body.style.cursor = 'ew-resize';
    }

    public static resizeEnd(onResize: (e: Event) => void): void {
        if (onResize !== ResizeController.onResize) { return; }
        ResizeController.onResize(undefined);
        ResizeController.onResize = () => { };
        ResizeController.resizeActive = false;
        document.body.style.cursor = '';
    }

    public static isResizeActive(): boolean {
        return ResizeController.resizeActive;
    }

    private static pointermove(e: MouseEvent): void {
        // e.stopImmediatePropagation();
        // e.stopPropagation();
        // e.preventDefault();
        if (!ResizeController.resizeActive) { return };
        ResizeController.onResize(e);
    }

    private static pointerup(e: MouseEvent): void {
        ResizeController.resizeEnd(ResizeController.onResize);
    }

    private static pointerleave(e: MouseEvent): void {
        ResizeController.resizeActive = false;
    }
}