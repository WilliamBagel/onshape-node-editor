<!-- ActionPalette.vue — #73 Blender-style action menu.
  Opened by the bottom Search button / F3. Searches the COMMANDS registry
  (editorSettings.ts) with fuzzy ranking; arrows move, Enter runs, Escape
  closes. Styled like NodePalette (one system): white card, hairline,
  14/13/12/11 scale, keycap chips — STYLE_GUIDE.md. -->
<template>
  <div v-if="open" class="actions-backdrop" @click.self="close">
    <div ref="panel" class="actions" role="dialog" aria-modal="true" aria-label="Search actions" @keydown="onPanelKeydown">
      <div class="actions-header">
        <h2 class="actions-title">Search actions</h2>
        <span class="actions-keycap">F3</span>
      </div>
      <input
        ref="search"
        v-model="term"
        class="actions-search"
        type="text"
        placeholder="Type an action…"
        aria-label="Search actions"
        role="combobox"
        aria-expanded="true"
        aria-controls="action-palette-list"
        :aria-activedescendant="activeId"
      />
      <div ref="list" id="action-palette-list" class="actions-list" role="listbox" aria-label="Actions and nodes">
        <button
          v-for="result in results"
          :key="result.key"
          :id="`action-palette-item-${result.key}`"
          :ref="(el) => registerItem(result.key, el)"
          type="button"
          class="actions-item"
          :class="{ 'actions-item--active': result.key === activeKey }"
          role="option"
          :aria-selected="result.key === activeKey"
          @click="choose(result)"
          @mouseenter="activeKey = result.key"
        >
          <span class="actions-item-name">{{ result.label }}</span>
          <span class="actions-item-desc">{{ result.description }}</span>
          <span v-if="result.kind === 'node'" class="actions-item-meta">node</span>
          <kbd v-else-if="bindings[result.id]" class="actions-keycap">{{ bindings[result.id] }}</kbd>
        </button>
        <p v-if="results.length === 0" class="actions-empty">No action or node matches.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ACTION_PALETTE_SHORTCUT, filterActions } from '../ui/actionPalette'
import type { CommandId, ShortcutBindings } from '../ui/editorSettings'
import type { PaletteInsertable } from '../rete/catalog-node-factory'

type PaletteResult =
  | { key: string; kind: 'command'; id: CommandId; label: string; description: string }
  | { key: string; kind: 'node'; item: PaletteInsertable; label: string; description: string }

const props = defineProps<{ open: boolean; bindings: ShortcutBindings; insertables?: PaletteInsertable[] }>()
const emit = defineEmits<{
  (e: 'select', id: CommandId): void
  (e: 'insert', item: PaletteInsertable): void
  (e: 'close'): void
}>()

const term = ref('')
const activeKey = ref<string | null>(null)
const search = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)
const itemRefs = new Map<string, unknown>()

function registerItem(key: string, el: unknown) {
  if (el == null) itemRefs.delete(key)
  else itemRefs.set(key, el)
}

/** Rank insertable nodes by name/category/description, same rules as actions. */
function filterInsertables(items: readonly PaletteInsertable[], query: string): PaletteInsertable[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(t => t !== '')
  if (tokens.length === 0) return []
  return items
    .map((item) => {
      const name = item.name.toLowerCase()
      const category = item.category.toLowerCase()
      const description = item.description.toLowerCase()
      let score = 0
      for (const token of tokens) {
        if (name.startsWith(token)) score += 100
        else if (name.includes(token)) score += 60
        else if (category.includes(token)) score += 30
        else if (description.includes(token)) score += 15
        else return { item, score: -1 }
      }
      return { item, score }
    })
    .filter(r => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.item)
}

const results = computed<PaletteResult[]>(() => {
  const actions: PaletteResult[] = filterActions(term.value).map(action => ({
    key: `command:${action.id}`,
    kind: 'command',
    id: action.id,
    label: action.label,
    description: action.description,
  }))
  const nodes: PaletteResult[] = filterInsertables(props.insertables ?? [], term.value).map(item => ({
    key: `node:${item.key}`,
    kind: 'node',
    item,
    label: item.name,
    description: item.description,
  }))
  // Empty query: actions first, then nothing (the list stays short). A query
  // merges both so typing "chamfer" finds the node, not just commands.
  return term.value.trim() === '' ? actions : [...actions, ...nodes]
})

const activeId = computed(() => (activeKey.value != null ? `action-palette-item-${activeKey.value}` : undefined))

watch(() => props.open, async (v) => {
  if (v) {
    term.value = ''
    activeKey.value = results.value[0]?.key ?? null
    await nextTick()
    search.value?.focus()
  }
})
watch(results, () => {
  if (activeKey.value == null || !results.value.some(r => r.key === activeKey.value)) {
    activeKey.value = results.value[0]?.key ?? null
  }
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
  // Dismissal returns focus to the canvas (see NodePalette).
  void nextTick(() => {
    const canvas = document.querySelector('main.rete') as HTMLElement | null
    if (canvas != null) {
      canvas.tabIndex = -1
      canvas.focus()
    }
  })
}
function choose(result: PaletteResult) {
  if (result.kind === 'command') emit('select', result.id)
  else emit('insert', result.item)
}

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
    const idx = results.value.findIndex(r => r.key === activeKey.value)
    const next = event.key === 'ArrowDown'
      ? Math.min(idx + 1, results.value.length - 1)
      : Math.max(idx - 1, 0)
    activeKey.value = results.value[next]?.key ?? null
    scrollActiveIntoView()
  } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
    const result = results.value.find(r => r.key === activeKey.value)
    if (result != null) choose(result)
  }
}

// Referenced so the template keycap stays in sync with the registry shortcut.
void ACTION_PALETTE_SHORTCUT
</script>

<style scoped>
.actions-backdrop { position: fixed; inset: 0; background: var(--backdrop-scrim); display: flex; justify-content: center; align-items: flex-start; padding-top: 10vh; z-index: 40; }
.actions { width: 460px; max-width: 92vw; max-height: min(80vh, 640px); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-card); box-shadow: var(--shadow-1); font-family: var(--font-sans); color: var(--ink); }
.actions-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 8px; flex: none; }
.actions-title { font-size: var(--font-size-heading); font-weight: var(--font-weight-title); line-height: var(--line-height-title); margin: 0; }
.actions-keycap { font-family: var(--font-mono); font-size: var(--font-size-keycap); border: 1px solid var(--hairline); border-radius: var(--radius-keycap); padding: 1px 4px; background: var(--surface-sunken); color: var(--text-secondary); opacity: 1; }
.actions-search { flex: none; width: calc(100% - 24px); margin: 0 12px 8px; padding: 6px 8px; font-size: var(--font-size-value); font-family: var(--font-sans); border: 1px solid var(--hairline); border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--ink); box-sizing: border-box; }
.actions-search:focus { outline: 2px solid var(--accent-steel); outline-offset: 1px; border-color: var(--accent-steel); }
/* Thin, always-visible classic scrollbar: overlay scrollbars render at
   width 0 and read as "no scrollbar" (user-reported: scrollbar doesn't
   work). */
.actions-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 8px 8px; scrollbar-width: thin; scrollbar-color: var(--hairline-strong) transparent; }
.actions-list::-webkit-scrollbar { width: 8px; }
.actions-list::-webkit-scrollbar-thumb { background: var(--hairline-strong); border-radius: 4px; }
.actions-list::-webkit-scrollbar-track { background: transparent; }
.actions-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 4px; border: none; background: transparent; cursor: pointer; font-family: var(--font-sans); text-align: left; }
/* See NodePalette: the active row needs a visibly darker tint than the
   white panel plus full-opacity text, not a one-step-off-white wash. */
.actions-item--active { background: var(--active-tint); box-shadow: inset 3px 0 0 var(--accent-steel); }
/* Keyboard-only ring (never on mouse click): 2px steel, inset so the
 * full-width row keeps its layout. #2f5f8f on white ≈ 6.7:1 contrast. */
.actions-item:focus-visible { outline: 2px solid var(--accent-steel); outline-offset: -2px; }
.actions-item--active .actions-item-name { opacity: 1; }
.actions-item--active .actions-item-desc { color: var(--text-secondary); opacity: 1; }
.actions-item--active .actions-item-meta { opacity: 1; }
.actions-item--active .actions-keycap { opacity: 1; }
.actions-item-name { font-size: var(--font-size-value); font-weight: 600; color: var(--ink); }
.actions-item-desc { flex: 1 1 auto; font-size: var(--font-size-label); color: var(--ink); opacity: var(--opacity-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions-item-meta { flex: none; font-family: var(--font-mono); font-size: var(--font-size-keycap); border: 1px solid var(--hairline); border-radius: var(--radius-keycap); padding: 1px 4px; color: var(--text-secondary); }
.actions-item .actions-keycap { flex: none; }
.actions-empty { font-size: var(--font-size-label); padding: 8px 4px; color: var(--ink); opacity: var(--opacity-secondary); }
</style>
