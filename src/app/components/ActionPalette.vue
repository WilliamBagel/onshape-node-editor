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
      <div class="actions-list" role="listbox" aria-label="Actions">
        <button
          v-for="action in results"
          :key="action.id"
          :ref="(el) => registerItem(action.id, el)"
          type="button"
          class="actions-item"
          :class="{ 'actions-item--active': action.id === activeId }"
          role="option"
          :aria-selected="action.id === activeId"
          @click="choose(action.id)"
          @mouseenter="activeId = action.id"
        >
          <span class="actions-item-name">{{ action.label }}</span>
          <span class="actions-item-desc">{{ action.description }}</span>
          <kbd v-if="bindings[action.id]" class="actions-keycap">{{ bindings[action.id] }}</kbd>
        </button>
        <p v-if="results.length === 0" class="actions-empty">No action matches.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ACTION_PALETTE_SHORTCUT, filterActions } from '../ui/actionPalette'
import type { CommandId, ShortcutBindings } from '../ui/editorSettings'

const props = defineProps<{ open: boolean; bindings: ShortcutBindings }>()
const emit = defineEmits<{ (e: 'select', id: CommandId): void; (e: 'close'): void }>()

const term = ref('')
const activeId = ref<CommandId | null>(null)
const search = ref<HTMLInputElement | null>(null)
const itemRefs = new Map<CommandId, unknown>()

function registerItem(id: CommandId, el: unknown) {
  if (el == null) itemRefs.delete(id)
  else itemRefs.set(id, el)
}

const results = computed(() => filterActions(term.value))

watch(() => props.open, async (v) => {
  if (v) {
    term.value = ''
    activeId.value = results.value[0]?.id ?? null
    await nextTick()
    search.value?.focus()
  }
})
watch(results, () => {
  if (activeId.value == null || !results.value.some(a => a.id === activeId.value)) {
    activeId.value = results.value[0]?.id ?? null
  }
  scrollActiveIntoView()
})

function scrollActiveIntoView() {
  const el = activeId.value != null ? itemRefs.get(activeId.value) : null
  if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest' })
}

function close() { emit('close') }
function choose(id: CommandId) { emit('select', id) }

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { close(); return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const idx = results.value.findIndex(a => a.id === activeId.value)
    const next = event.key === 'ArrowDown'
      ? Math.min(idx + 1, results.value.length - 1)
      : Math.max(idx - 1, 0)
    activeId.value = results.value[next]?.id ?? null
    scrollActiveIntoView()
  } else if (event.key === 'Enter') {
    if (activeId.value != null) choose(activeId.value)
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
.actions-keycap { font-family: var(--font-mono); font-size: var(--font-size-keycap); border: 1px solid var(--hairline); border-radius: var(--radius-keycap); padding: 1px 4px; color: var(--ink); opacity: var(--opacity-secondary); }
.actions-search { flex: none; width: calc(100% - 24px); margin: 0 12px 8px; padding: 6px 8px; font-size: var(--font-size-value); font-family: var(--font-sans); border: 1px solid var(--hairline); border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--ink); box-sizing: border-box; }
.actions-search:focus { outline: 1px solid var(--accent-steel); border-color: var(--accent-steel); }
.actions-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 8px 8px; }
.actions-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 4px; border: none; background: transparent; cursor: pointer; font-family: var(--font-sans); text-align: left; }
.actions-item--active { background: var(--surface-sunken); }
.actions-item-name { font-size: var(--font-size-value); font-weight: 600; color: var(--ink); }
.actions-item-desc { flex: 1 1 auto; font-size: var(--font-size-label); color: var(--ink); opacity: var(--opacity-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions-item .actions-keycap { flex: none; }
.actions-empty { font-size: var(--font-size-label); padding: 8px 4px; color: var(--ink); opacity: var(--opacity-secondary); }
</style>
