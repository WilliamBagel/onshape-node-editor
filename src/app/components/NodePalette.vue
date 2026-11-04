<!-- NodePalette.vue — searchable, category-grouped catalog palette (#8).
  Opened from the toolbar / Ctrl-K; keyboard placement lands at viewport centre.
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
        placeholder="Search the catalog…"
        aria-label="Search the catalog"
        @keydown="onKeydown"
      />
      <div class="palette-list" role="listbox" aria-label="Catalog entries">
        <template v-for="group in groups" :key="group.category">
          <div class="palette-category">{{ group.category }}</div>
          <button
            v-for="entry in group.entries"
            :key="entry.key"
            type="button"
            class="palette-item"
            :class="{ 'palette-item--active': entry.key === activeKey }"
            role="option"
            :aria-selected="entry.key === activeKey"
            @click="choose(entry)"
            @mouseenter="activeKey = entry.key"
          >
            <span class="palette-item-name">{{ entry.name }}</span>
            <span class="palette-item-meta">{{ entry.kind }}</span>
          </button>
        </template>
        <p v-if="flat.length === 0" class="palette-empty">No node-able entries match.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { CatalogEntry } from '../onshape/catalog/types'
import { filterCatalogEntries, groupByCategory, nodeableEntries } from '../rete/catalog-node-factory'

const props = defineProps<{ open: boolean; entries: readonly CatalogEntry[] }>()
const emit = defineEmits<{ (e: 'select', entry: CatalogEntry): void; (e: 'close'): void }>()

const term = ref('')
const activeKey = ref<string | null>(null)
const search = ref<HTMLInputElement | null>(null)

const flat = computed(() => filterCatalogEntries(nodeableEntries(props.entries), term.value))
const groups = computed(() => groupByCategory(flat.value))

watch(() => props.open, async (v) => {
  if (v) { term.value = ''; activeKey.value = flat.value[0]?.key ?? null; await nextTick(); search.value?.focus() }
})
watch(flat, () => { if (activeKey.value == null || !flat.value.some(e => e.key === activeKey.value)) activeKey.value = flat.value[0]?.key ?? null })

function close() { emit('close') }
function choose(entry: CatalogEntry) { emit('select', entry) }
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { close(); return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const idx = flat.value.findIndex(e => e.key === activeKey.value)
    const next = event.key === 'ArrowDown' ? Math.min(idx + 1, flat.value.length - 1) : Math.max(idx - 1, 0)
    activeKey.value = flat.value[next]?.key ?? null
  } else if (event.key === 'Enter') {
    const entry = flat.value.find(e => e.key === activeKey.value)
    if (entry) choose(entry)
  }
}
</script>

<style scoped>
.palette-backdrop { position: fixed; inset: 0; background: var(--backdrop-scrim); display: flex; justify-content: center; align-items: flex-start; padding-top: 10vh; z-index: 40; }
.palette { width: 420px; max-width: 92vw; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-card); box-shadow: var(--shadow-1); font-family: var(--font-sans); color: var(--text-primary); }
.palette-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 8px; }
.palette-title { font-size: var(--font-size-heading); font-weight: var(--font-weight-title); line-height: var(--line-height-title); margin: 0; }
.palette-keycap { font-family: var(--font-mono); font-size: var(--font-size-keycap); border: 1px solid var(--hairline); border-radius: var(--radius-keycap); padding: 1px 4px; color: var(--text-primary); opacity: var(--opacity-secondary); }
.palette-search { width: calc(100% - 24px); margin: 0 12px 8px; padding: 6px 8px; font-size: var(--font-size-value); font-family: var(--font-sans); border: 1px solid var(--hairline); border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--text-primary); box-sizing: border-box; }
.palette-search:focus { outline: 1px solid var(--accent-steel); border-color: var(--accent-steel); }
.palette-list { max-height: 320px; overflow-y: auto; padding: 0 8px 8px; }
.palette-category { font-size: var(--font-size-section); font-weight: var(--font-weight-section); padding: 8px 4px 4px; color: var(--text-primary); opacity: var(--opacity-secondary); }
.palette-item { display: flex; justify-content: space-between; width: 100%; padding: 6px 4px; border: none; background: transparent; cursor: pointer; font-family: var(--font-sans); text-align: left; }
.palette-item--active { background: var(--surface-sunken); }
.palette-item-name { font-size: var(--font-size-value); color: var(--text-primary); }
.palette-item-meta { font-size: var(--font-size-meta); color: var(--text-primary); opacity: var(--opacity-faint); }
.palette-empty { font-size: var(--font-size-label); padding: 8px 4px; color: var(--text-primary); opacity: var(--opacity-secondary); }
</style>
