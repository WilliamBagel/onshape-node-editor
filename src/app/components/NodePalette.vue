<!-- NodePalette.vue — searchable, category-grouped insertable catalog (#8, #73).
  Opened from the action palette / Ctrl-K; keyboard placement lands at
  viewport centre. Covers every insertable node: node-able catalog
  entries (statement, value, function, utility), array nodes, the math
  expression node and group instances — ranked search over name,
  category and description.
  Styled per STYLE_GUIDE.md: white card, hairline, 14/13/12/11 scale, keycaps. -->
<template>
  <div v-if="open" class="palette-backdrop" @click.self="close">
    <div ref="panel" class="palette" role="dialog" aria-modal="true" aria-label="Add node" @keydown="onPanelKeydown">
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
        aria-label="Search nodes"
        role="combobox"
        aria-expanded="true"
        aria-controls="node-palette-list"
        :aria-activedescendant="activeId"
      />
      <div ref="list" id="node-palette-list" class="palette-list" role="listbox" aria-label="Insertable nodes">
        <template v-for="group in groups" :key="group.category">
          <div class="palette-category">{{ group.category }}</div>
          <button
            v-for="item in group.entries"
            :key="item.key"
            :id="`node-palette-item-${item.key}`"
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
const list = ref<HTMLElement | null>(null)
const itemRefs = new Map<string, unknown>()

function registerItem(key: string, el: unknown) {
  if (el == null) itemRefs.delete(key)
  else itemRefs.set(key, el)
}

const flat = computed(() => searchPaletteInsertables(props.insertables, term.value))
const groups = computed(() => groupInsertablesByCategory(flat.value))
const activeId = computed(() => (activeKey.value != null ? `node-palette-item-${activeKey.value}` : undefined))

watch(() => props.open, async (v) => {
  if (v) { term.value = ''; activeKey.value = flat.value[0]?.key ?? null; await nextTick(); search.value?.focus() }
})
watch(flat, () => {
  if (activeKey.value == null || !flat.value.some(e => e.key === activeKey.value)) activeKey.value = flat.value[0]?.key ?? null
  scrollActiveIntoView()
})

/**
 * Keep the active row inside the list by scrolling the list only.
 * scrollIntoView() can also scroll the document/backdrop, which made
 * arrow navigation shake the dialog; adjusting list.scrollTop from the
 * row rects never touches any other scroll container.
 */
function scrollActiveIntoView() {
  const el = activeKey.value != null ? itemRefs.get(activeKey.value) : null
  const container = list.value
  if (!(el instanceof HTMLElement) || container == null) return
  const pad = 4
  const listRect = container.getBoundingClientRect()
  const itemRect = el.getBoundingClientRect()
  if (itemRect.top < listRect.top + pad) container.scrollTop -= listRect.top + pad - itemRect.top
  else if (itemRect.bottom > listRect.bottom - pad) container.scrollTop += itemRect.bottom - (listRect.bottom - pad)
}

function close() {
  emit('close')
  // Escape (or backdrop) dismissal returns focus to the canvas so keyboard
  // shortcuts keep working without a mouse trip back.
  void nextTick(() => {
    const canvas = document.querySelector('main.rete') as HTMLElement | null
    if (canvas != null) {
      canvas.tabIndex = -1
      canvas.focus()
    }
  })
}
function choose(item: PaletteInsertable) { emit('select', item) }

/**
 * Panel-level key handling: Escape closes from ANY focus inside the palette
 * (search input or a row button), and arrows move the active row from
 * anywhere. Enter on a row button is left to the native click so the
 * choice is not made twice. Tab is unhandled (no trap).
 */
function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); close(); return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const idx = flat.value.findIndex(e => e.key === activeKey.value)
    const next = event.key === 'ArrowDown' ? Math.min(idx + 1, flat.value.length - 1) : Math.max(idx - 1, 0)
    activeKey.value = flat.value[next]?.key ?? null
    scrollActiveIntoView()
  } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
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
.palette-search:focus { outline: 2px solid var(--accent-steel); outline-offset: 1px; border-color: var(--accent-steel); }
/* #73: the list owns the remaining height and scrolls inside the dialog
   (flex + min-height: 0), so long catalogs stay reachable. The scrollbar
   is a thin, always-visible classic scrollbar (overlay scrollbars render
   at width 0 and read as "no scrollbar"). */
.palette-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 8px 8px; scrollbar-width: thin; scrollbar-color: var(--hairline-strong) transparent; }
.palette-list::-webkit-scrollbar { width: 8px; }
.palette-list::-webkit-scrollbar-thumb { background: var(--hairline-strong); border-radius: 4px; }
.palette-list::-webkit-scrollbar-track { background: transparent; }
.palette-category { font-size: var(--font-size-section); font-weight: var(--font-weight-section); padding: 8px 4px 4px; color: var(--ink); opacity: var(--opacity-secondary); }
.palette-item { display: flex; align-items: baseline; gap: 8px; min-width: 0; width: 100%; padding: 6px 4px; border: none; background: transparent; cursor: pointer; font-family: var(--font-sans); text-align: left; }
/* The keyboard-active row reads at a glance: a clearly darker tint than
   the white panel (the old --surface-sunken was one step off white and
   read as "no selection"), an accent-steel keyline, and every text span
   at full opacity — no reduced-opacity text on the active row. */
.palette-item--active { background: var(--active-tint); box-shadow: inset 3px 0 0 var(--accent-steel); }
/* Keyboard-only ring (never on mouse click): 2px steel, inset so the
 * full-width row keeps its layout. #2f5f8f on white ≈ 6.7:1 contrast. */
.palette-item:focus-visible { outline: 2px solid var(--accent-steel); outline-offset: -2px; }
.palette-item--active .palette-item-name { color: var(--ink); opacity: 1; }
.palette-item--active .palette-item-meta { color: var(--ink-soft); opacity: 1; }
.palette-item-name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-value); color: var(--ink); }
.palette-item-meta { flex: 0 0 auto; white-space: nowrap; font-size: var(--font-size-meta); color: var(--ink-soft); }
.palette-empty { font-size: var(--font-size-label); padding: 8px 4px; color: var(--ink); opacity: var(--opacity-secondary); }
</style>
