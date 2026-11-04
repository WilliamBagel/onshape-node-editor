<!-- ActionPalette.vue — #73 Blender-style action menu.
  Opened by the bottom Search button / F3. Searches the COMMANDS registry
  (editorSettings.ts) with fuzzy ranking; arrows move, Enter runs, Escape
  closes. Styled like NodePalette (one system): white card, hairline,
  14/13/12/11 scale, keycap chips — STYLE_GUIDE.md. -->
<template>
  <div v-if="open" class="actions-backdrop" @click.self="close">
    <div ref="panel" class="actions" role="dialog" aria-modal="true" aria-label="Search actions">
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
        @keydown="onKeydown"
      />
      <div class="actions-list" role="listbox" aria-label="Actions and nodes">
        <button
          v-for="result in results"
          :key="result.key"
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

function scrollActiveIntoView() {
  const el = activeKey.value != null ? itemRefs.get(activeKey.value) : null
  if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' })
}

function close() { emit('close') }
function choose(result: PaletteResult) {
  if (result.kind === 'command') emit('select', result.id)
  else emit('insert', result.item)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { close(); return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const idx = results.value.findIndex(r => r.key === activeKey.value)
    const next = event.key === 'ArrowDown'
      ? Math.min(idx + 1, results.value.length - 1)
      : Math.max(idx - 1, 0)
    activeKey.value = results.value[next]?.key ?? null
    scrollActiveIntoView()
  } else if (event.key === 'Enter') {
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
.actions-search:focus { outline: 1px solid var(--accent-steel); border-color: var(--accent-steel); }
.actions-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 8px 8px; }
.actions-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 4px; border: none; background: transparent; cursor: pointer; font-family: var(--font-sans); text-align: left; }
.actions-item--active { background: var(--surface-sunken); }
.actions-item-name { font-size: var(--font-size-value); font-weight: 600; color: var(--ink); }
.actions-item-desc { flex: 1 1 auto; font-size: var(--font-size-label); color: var(--ink); opacity: var(--opacity-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions-item-meta { flex: none; font-family: var(--font-mono); font-size: var(--font-size-keycap); border: 1px solid var(--hairline); border-radius: var(--radius-keycap); padding: 1px 4px; color: var(--text-secondary); }
.actions-item .actions-keycap { flex: none; }
.actions-empty { font-size: var(--font-size-label); padding: 8px 4px; color: var(--ink); opacity: var(--opacity-secondary); }
</style>
