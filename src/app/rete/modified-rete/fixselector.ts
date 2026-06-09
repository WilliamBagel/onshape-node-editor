
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