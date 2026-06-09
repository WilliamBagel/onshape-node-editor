<!--
  TopBar.vue
  Authored by: Claude Sonnet 4.6 (Anthropic)
  Top toolbar for the node editor. Obsidian-inspired styling:
  white background, grey/black interactive elements.

  Left group  → Build, Run
  Right group → Save File, Open File, Settings

  All buttons emit named events on click and show hover tooltips.

  Emits:
    build    - User clicked the Build button
    run      - User clicked the Run button
    save     - User clicked the Save File button
    open     - User clicked the Open File button
    settings - User clicked the Settings button
-->

<script setup lang="ts">
import { ref } from 'vue'
// Claude Sonnet 4.6: Import shared icon + tooltip sub-components
import SvgIcon from './SvgIcon.vue'

/* ── Props ─────────────────────────────────────────────────────── */
defineProps<{
  /** Optional graph / project name shown in the centre of the bar */
  projectName?: string
}>()

/* ── Emits ─────────────────────────────────────────────────────── */
const emit = defineEmits<{
  (e: 'build'): void
  (e: 'run'): void
  (e: 'save'): void
  (e: 'open'): void
  (e: 'settings'): void
}>()

/* ── Tooltip hover state ────────────────────────────────────────── */
// Claude Sonnet 4.6: Track which button is hovered so only one tooltip shows
type ButtonKey = 'build' | 'run' | 'save' | 'open' | 'settings' | null
</script>

<template>
  <div id="top-bar" class="toolbar" role="toolbar" aria-label="Node editor top toolbar">

    <!-- ── Left group: Build & Run ──────────────────────────────── -->
    <!-- Claude Sonnet 4.6: Left action group -->
    <div class="toolbar-group toolbar-group--left">
      <!-- Run button -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Run"
          v-tooltip="{ label: 'Run', description: 'Build and run the current node graph.' }"
          @click="emit('run')">
          <SvgIcon href="#svg-icon-play-dialog" :size="16" aria-label="Run" />
          <span class="btn-label">Run</span>
        </button>
      </div>

      <!-- Divider between Run and Build -->
      <div class="toolbar-divider" aria-hidden="true" />
      <!-- Build button -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Build"
          v-tooltip="{ label: 'Build', description: 'Compile and validate the current node graph.' }"
          @click="emit('build')">
          <SvgIcon href="#svg-icon-update-now" :size="16" aria-label="Build" />
          <span class="btn-label">Build</span>
        </button>
      </div>

    </div>

    <!-- ── Centre: optional project name ────────────────────────── -->
    <div v-if="projectName" class="toolbar-centre">
      <span class="project-name">{{ projectName }}</span>
    </div>

    <!-- ── Right group: Save, Open, Settings ────────────────────── -->
    <!-- Claude Sonnet 4.6: Right action group -->
    <div class="toolbar-group toolbar-group--right">

      <!-- Save file button -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Save file"
          v-tooltip="{ label: 'Save File', description: 'Save the current graph' }"
          @click="emit('save')">
          <SvgIcon href="#svg-icon-export-button" :size="16" aria-label="Save file" />
        </button>
      </div>

      <!-- Open file button -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Open file"
          v-tooltip="{ label: 'Open File', description: 'Load a graph from a file idk really' }"
          @click="emit('open')">
          <SvgIcon href="#svg-icon-folder" :size="16" aria-label="Open file" />
        </button>
      </div>

      <!-- Divider before Settings -->
      <div class="toolbar-divider" aria-hidden="true" />

      <!-- Settings button -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Settings"
          v-tooltip="{ label: 'Settings', description: 'Open editor preferences and configuration.' }"
          @click="emit('settings')">
          <SvgIcon href="#svg-icon-settings-button" :size="16" aria-label="Settings" />
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ── Design tokens (Obsidian-inspired) ──────────────────────────── */
:root {
  --toolbar-height: 36px;
  --toolbar-bg: #ffffff;
  --toolbar-border: #e0e0e0;
  --btn-color: #3a3a3a;
  --btn-hover-bg: #ebebeb;
  --btn-active-bg: #d6d6d6;
  --btn-accent-color: #3a8a4e;
  /* green tint for Run */
  --btn-radius: 5px;
  --divider-color: #d8d8d8;
  --font-ui: 'Inter', 'Segoe UI', system-ui, sans-serif;
}

/* ── Shell ──────────────────────────────────────────────────────── */
.toolbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: var(--toolbar-height);
  padding: 0 8px;
  user-select: none;
  font-family: var(--font-ui);
  box-sizing: border-box;
  position: relative;
  /* needed for absolute tooltip children */
}

/* ── Groups ─────────────────────────────────────────────────────── */
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-group--left {
  flex: 1;
  justify-content: flex-start;
}

.toolbar-group--right {
  flex: 1;
  justify-content: flex-end;
}

/* ── Centre label ───────────────────────────────────────────────── */
.toolbar-centre {
  flex: 0 0 auto;
  padding: 0 12px;
}

.project-name {
  font-size: 12px;
  font-weight: 500;
  color: #888;
  letter-spacing: 0.03em;
}

/* ── Divider ────────────────────────────────────────────────────── */
.toolbar-divider {
  width: 1px;
  height: 18px;
  background: var(--divider-color);
  margin: 0 4px;
  flex-shrink: 0;
}

/* ── Button wrapper (position: relative for tooltip) ────────────── */
.toolbar-btn-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* ── Button base ────────────────────────────────────────────────── */
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 7px;
  border: none;
  border-radius: var(--btn-radius);
  background: transparent;
  color: var(--btn-color);
  cursor: pointer;
  font-size: 12px;
  font-family: var(--font-ui);
  font-weight: 500;
  transition: background 0.1s ease, color 0.1s ease;
  outline-offset: 2px;
}

.toolbar-btn:hover {
  background: var(--btn-hover-bg);
}

.toolbar-btn:active {
  background: var(--btn-active-bg);
}

/* Claude Sonnet 4.6: Accent style for the Run button */
.toolbar-btn--accent {
  color: var(--btn-accent-color);
}

.toolbar-btn--accent:hover {
  background: #eaf5ec;
}

/* ── Label text (shown on Build / Run only) ─────────────────────── */
.btn-label {
  letter-spacing: 0.01em;
}
</style>
