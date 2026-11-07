<!-- NodePalette.vue — searchable, category-grouped insertable catalog (#8, #73).
  Opened from the action palette / Ctrl-K; keyboard placement lands at
  viewport centre. Covers every insertable node: node-able catalog
  entries (statement, value, function, utility), array nodes, the math
  expression node and group instances — ranked search over name,
  category and description.
  Styled per STYLE_GUIDE.md: white card, hairline, 14/13/12/11 scale, keycaps. -->
<template>
  <div v-if="open" class="palette-backdrop" @click.self="close">
    <div ref="panel" class="palette" role="dialog" aria-modal="true" aria-label="Add node">
      <div class="palette-header">
        <h2 class="palette-title">Add node</h2>
        <span class="palette-keycap">Ctrl K</span>
      </div>
      <input
        ref="search"
        v-model="term"
        class="palette-search"
        type="text"
        placeholder="Search every node…"
        aria-label="Search every node"
        @keydown="onKeydown"
      />
      <div class="palette-list" role="listbox" aria-label="Insertable nodes">
        <template v-for="group in groups" :key="group.category">
          <div class="palette-category">{{ group.category }}</div>
          <button
            v-for="item in group.entries"
            :key="item.key"
            :ref="(el) => registerItem(item.key, el)"
            type="button"
            class="palette-item"
            :class="{ 'palette-item--active': item.key === activeKey }"
            role="option"
            :aria-selected="item.key === activeKey"
            @click="choose(item)"
            @mouseenter="activeKey = item.key"
          >
            <span class="palette-item-name">{{ item.name }}</span>
            <span class="palette-item-meta">{{ item.meta }}</span>
          </button>
        </template>
        <p v-if="flat.length === 0" class="palette-empty">No node matches.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  groupInsertablesByCategory,
  searchPaletteInsertables,
  type PaletteInsertable,
} from '../rete/catalog-node-factory'

const props = defineProps<{ open: boolean; insertables: readonly PaletteInsertable[] }>()
const emit = defineEmits<{ (e: 'select', item: PaletteInsertable): void; (e: 'close'): void }>()

const term = ref('')
const activeKey = ref<string | null>(null)
const search = ref<HTMLInputElement | null>(null)
const itemRefs = new Map<string, unknown>()

function registerItem(key: string, el: unknown) {
  if (el == null) itemRefs.delete(key)
  else itemRefs.set(key, el)
}

const flat = computed(() => searchPaletteInsertables(props.insertables, term.value))
const groups = computed(() => groupInsertablesByCategory(flat.value))

watch(() => props.open, async (v) => {
  if (v) { term.value = ''; activeKey.value = flat.value[0]?.key ?? null; await nextTick(); search.value?.focus() }
})
watch(flat, () => {
  if (activeKey.value == null || !flat.value.some(e => e.key === activeKey.value)) activeKey.value = flat.value[0]?.key ?? null
  scrollActiveIntoView()
})

function scrollActiveIntoView() {
  const el = activeKey.value != null ? itemRefs.get(activeKey.value) : null
  if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' })
}

function close() { emit('close') }
function choose(item: PaletteInsertable) { emit('select', item) }
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { close(); return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const idx = flat.value.findIndex(e => e.key === activeKey.value)
    const next = event.key === 'ArrowDown' ? Math.min(idx + 1, flat.value.length - 1) : Math.max(idx - 1, 0)
    activeKey.value = flat.value[next]?.key ?? null
    scrollActiveIntoView()
  } else if (event.key === 'Enter') {
    const item = flat.value.find(e => e.key === activeKey.value)
    if (item) choose(item)
  }
}
</script>

<style scoped>
.palette-backdrop { position: fixed; inset: 0; background: var(--backdrop-scrim); display: flex; justify-content: center; align-items: flex-start; padding-top: 10vh; z-index: 40; }
.palette { width: 460px; max-width: 92vw; max-height: min(80vh, 640px); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-card); box-shadow: var(--shadow-1); font-family: var(--font-sans); color: var(--ink); }
.palette-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 8px; flex: none; }
.palette-title { font-size: var(--font-size-heading); font-weight: var(--font-weight-title); line-height: var(--line-height-title); margin: 0; }
.palette-keycap { font-family: var(--font-mono); font-size: var(--font-size-keycap); border: 1px solid var(--hairline); border-radius: var(--radius-keycap); padding: 1px 4px; color: var(--ink); opacity: var(--opacity-secondary); }
.palette-search { flex: none; width: calc(100% - 24px); margin: 0 12px 8px; padding: 6px 8px; font-size: var(--font-size-value); font-family: var(--font-sans); border: 1px solid var(--hairline); border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--ink); box-sizing: border-box; }
.palette-search:focus { outline: 1px solid var(--accent-steel); border-color: var(--accent-steel); }
/* #73: the list owns the remaining height and scrolls inside the dialog
   (flex + min-height: 0), so long catalogs stay reachable. */
.palette-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 8px 8px; }
.palette-category { font-size: var(--font-size-section); font-weight: var(--font-weight-section); padding: 8px 4px 4px; color: var(--ink); opacity: var(--opacity-secondary); }
.palette-item { display: flex; align-items: baseline; gap: 8px; min-width: 0; width: 100%; padding: 6px 4px; border: none; background: transparent; cursor: pointer; font-family: var(--font-sans); text-align: left; }
.palette-item--active { background: var(--surface-sunken); }
.palette-item-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-value); color: var(--ink); }
.palette-item-meta { flex: 0 0 auto; white-space: nowrap; font-size: var(--font-size-meta); color: var(--ink-soft); }
.palette-empty { font-size: var(--font-size-label); padding: 8px 4px; color: var(--ink); opacity: var(--opacity-secondary); }
</style>
