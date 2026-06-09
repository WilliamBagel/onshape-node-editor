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
        </button>
      </div>

    </div>

  </div>
</template>

<style scoped>
/* ── Design tokens (match TopBar) ───────────────────────────────── */
:root {
  --toolbar-bg: #ffffff;
  --toolbar-border: #e0e0e0;
  --btn-color: #3a3a3a;
  --btn-hover-bg: #ebebeb;
  --btn-active-bg: #d6d6d6;
  --btn-radius: 5px;
  --divider-color: #d8d8d8;
  --font-ui: 'Inter', 'Segoe UI', system-ui, sans-serif;
}

/* ── Shell ──────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  /* entire bar centred */
  border-top: 1px solid var(--toolbar-border);
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
  border-radius: 11px;
  background: #f2f2f2;
  border: 1px solid #e2e2e2;
}

.graph-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4caf6e;
  /* green "active" indicator */
  flex-shrink: 0;
}

.graph-name {
  font-size: 11px;
  font-weight: 600;
  color: #444;
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
  background: var(--divider-color);
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
  color: var(--btn-color);
  cursor: pointer;
  font-size: 11px;
  font-family: var(--font-ui);
  font-weight: 500;
  transition: background 0.1s ease;
  outline-offset: 2px;
}

.toolbar-btn:hover {
  background: var(--btn-hover-bg);
}

.toolbar-btn:active {
  background: var(--btn-active-bg);
}

.btn-label {
  letter-spacing: 0.01em;
}
</style>
