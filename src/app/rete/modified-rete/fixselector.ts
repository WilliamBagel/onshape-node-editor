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
 * Selector class. Used to collect selected entities (nodes, connections, etc.) and synchronize them (select, unselect, translate, etc.).
 * Can be extended to add custom functionality.
 */
export class Selector<E extends SelectorEntity> {
    entities = new Map<string, E>()
    pickId: string | null = null

    isSelected(entity: Pick<E, 'label' | 'id'>) {
        return this.entities.has(`${entity.label}_${entity.id}`)
    }

    async add(entity: E, accumulate: boolean) {
        if (!accumulate) await this.unselectAll()
        this.entities.set(`${entity.label}_${entity.id}`, entity)
    }

    async remove(entity: Pick<E, 'label' | 'id'>) {
        const id = `${entity.label}_${entity.id}`
        const item = this.entities.get(id)

        if (item) {
            this.entities.delete(id)
            await item.unselect()
        }
    }

    async unselectAll() {
        await Promise.all([...Array.from(this.entities.values())].map(item => this.remove(item)))
    }

    async translate(dx: number, dy: number) {
        await Promise.all(Array.from(this.entities.values()).map(item => !this.isPicked(item) && item.translate(dx, dy)))
    }

    pick(entity: Pick<E, 'label' | 'id'>) {
        this.pickId = `${entity.label}_${entity.id}`
    }

    release() {
        this.pickId = null
    }

    isPicked(entity: Pick<E, 'label' | 'id'>) {
        return this.pickId === `${entity.label}_${entity.id}`
    }
}

export type SelectorEntity = {
    label: string
    id: string
    unselect(): void | Promise<void>
    translate(dx: number, dy: number): void | Promise<void>
}

export class FixSelector<E extends SelectorEntity> extends Selector<E> {
    async add(entity: E, accumulate: boolean) {
        console.log(entity.id);
        const entityKey = `${entity.label}_${entity.id}`;
        if (this.entities.get(entityKey) != null) { return; }
        if (!accumulate) { await this.unselectAll() };
        this.entities.set(entityKey, entity)
    }
}