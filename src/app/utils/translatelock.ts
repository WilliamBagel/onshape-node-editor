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
 * Static class for use by TranslateLock componenet
 * unlock should be called on component pointerdown
 * lock should be called on component pointerup
 * only one component can be activated/receive movements events at one time
 */
export class TranslateLock {
    private static translateActive = false;
    private static default = false; 

    static {
        document.addEventListener('pointerleave', TranslateLock.pointerleave);
        document.addEventListener('pointerup', TranslateLock.pointerup);
    }

    public static unlock(): void {
        this.translateActive = true;
    }

    public static lock(): void {
        this.translateActive = false;
    }

    /**
     * Invert the default value
     */
    public static invert(): void {
        TranslateLock.default = !TranslateLock.default;
    }

    public static isLocked(): boolean {
        return TranslateLock.translateActive === this.default;
    }

    private static pointerleave(e: MouseEvent): void {
        TranslateLock.translateActive = false;
    }

    private static pointerup(e: MouseEvent): void {
        TranslateLock.translateActive = false;
    }
}