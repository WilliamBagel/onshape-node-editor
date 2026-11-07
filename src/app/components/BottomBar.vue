<!--
  BottomBar.vue
  Authored by: Claude Sonnet 4.6 (Anthropic)
  Bottom status / navigation toolbar for the node editor.
  Obsidian-inspired: white background, grey/black interactive elements.

  Centre group → Graph name (read-only display), Search button

  Emits:
    search - User clicked the Search button
-->

<script setup lang="ts">
import { ref } from 'vue'
// Claude Sonnet 4.6: Reuse the same icon + tooltip components as TopBar
import SvgIcon from './SvgIcon.vue'

/* ── Props ─────────────────────────────────────────────────────── */
defineProps<{
  /** Display name of the currently active graph */
  graphName?: string
}>()

/* ── Emits ─────────────────────────────────────────────────────── */
const emit = defineEmits<{
  (e: 'search'): void
}>()

/* ── Tooltip hover state ────────────────────────────────────────── */
// Claude Sonnet 4.6: Same hover pattern as TopBar for consistency
const hoveredButton = ref<'search' | null>(null)
</script>

<template>
  <div id="bottom-bar" class="toolbar" role="toolbar" aria-label="Node editor bottom toolbar">

    <!-- ── Centre group: graph name + search ────────────────────── -->
    <!-- Claude Sonnet 4.6: Centre-aligned content group -->
    <div class="toolbar-group toolbar-group--centre">

      <!-- Graph name chip -->
      <div class="graph-name-chip" aria-label="Current graph">
        <!-- Decorative dot indicating active graph -->
        <span class="graph-dot" aria-hidden="true" />
        <span class="graph-name">{{ graphName ?? 'Untitled Graph' }}</span>
      </div>

      <!-- Divider -->
      <div class="toolbar-divider" aria-hidden="true" />

      <!-- Search button -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Search nodes"
          v-tooltip="{ label: 'Search actions', description: 'Find action and tools.' }"
          @click="emit('search')">
          <SvgIcon href="#svg-icon-search" :size="14" aria-label="Search" />
          <span class="btn-label">Search</span>
          <kbd class="btn-keycap">F3</kbd>
        </button>
      </div>

    </div>

  </div>
</template>

<style scoped>
/* ── Design tokens (match TopBar) ───────────────────────────────── */
:root {
  --btn-radius: var(--radius-control);
  --font-ui: 'Inter', 'Segoe UI', system-ui, sans-serif;
}

/* ── Shell ──────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  /* entire bar centred */
  border-top: 1px solid var(--hairline);
  padding: 0 8px;
  user-select: none;
  font-family: var(--font-ui);
  box-sizing: border-box;
  position: relative;
  /* needed for tooltip positioning */
}

/* ── Centre group ───────────────────────────────────────────────── */
.toolbar-group--centre {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ── Graph name chip ────────────────────────────────────────────── */
/* Claude Sonnet 4.6: Subtle pill showing the active graph name */
.graph-name-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 22px;
  border-radius: var(--radius-control);
  background: var(--surface-panel);
  border: 1px solid var(--hairline);
}

.graph-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--flow-teal);
  /* green "active" indicator */
  flex-shrink: 0;
}

.graph-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink);
  letter-spacing: 0.03em;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Divider ────────────────────────────────────────────────────── */
.toolbar-divider {
  width: 1px;
  height: 16px;
  background: var(--hairline);
  margin: 0 2px;
  flex-shrink: 0;
}

/* ── Button wrapper ─────────────────────────────────────────────── */
.toolbar-btn-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* ── Button ─────────────────────────────────────────────────────── */
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 7px;
  border: none;
  border-radius: var(--btn-radius);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  font-size: 11px;
  font-family: var(--font-ui);
  font-weight: 500;
  transition: background 0.1s ease;
  outline-offset: 2px;
}

.toolbar-btn:hover {
  background: var(--surface-sunken);
}

.toolbar-btn:active {
  background: var(--border-subtle);
}

/* Keyboard-only ring (never on mouse click): matches the top toolbar.
 * #2f5f8f on white ≈ 6.7:1 contrast. */
.toolbar-btn:focus-visible {
  outline: 2px solid var(--accent-steel);
  outline-offset: 2px;
}

.btn-label {
  letter-spacing: 0.01em;
}

.btn-keycap {
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-keycap);
  padding: 1px 4px;
  background: var(--surface-sunken);
  color: var(--text-secondary);
  opacity: 1;
}
</style>
