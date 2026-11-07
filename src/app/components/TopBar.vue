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
    upload   - User clicked the Upload button (build + write to a Feature Studio)
    target   - User clicked the Upload Target button
    save     - User clicked the Save File button
    open     - User clicked the Open File button
    settings - User clicked the Settings button
-->

<script setup lang="ts">
// Claude Sonnet 4.6: Import shared icon + tooltip sub-components
import SvgIcon from './SvgIcon.vue'
// #30: the design-rule check tab reads the one log store and reports its state.
import DesignCheckTab from './DesignCheckTab.vue'
import type { BuildLogStore } from '../logging/buildlog'

/* ── Props ─────────────────────────────────────────────────────── */
defineProps<{
  /** Optional graph / project name shown in the centre of the bar */
  projectName?: string
  /** #14: group editing breadcrumb ("Top level / Group A / Group B"); empty at the top level. */
  groupBreadcrumb?: string[]
  /** Group config: true while editing a group; shows the Start/End Feature panel button. */
  groupEditing?: boolean
  /** Feature config: true when a Define Feature node is selected. */
  featureSelected?: boolean
  /** #30: the build/upload/run log; present when the design-check tab is shown. */
  log?: BuildLogStore
}>()

/* ── Emits ─────────────────────────────────────────────────────── */
const emit = defineEmits<{
  (e: 'build'): void
  (e: 'run'): void
  (e: 'upload'): void
  (e: 'target'): void
  (e: 'newGraph'): void
  (e: 'runTarget'): void
  (e: 'save'): void
  (e: 'open'): void
  (e: 'settings'): void
  /** #30: "Locate" on a design check row; the app selects that node. */
  (e: 'locateNode', nodeId: string): void
  /** #14: create a node group from the current selection. */
  (e: 'createGroup'): void
  /** Group config: toggle the Start/End Feature (inputs/outputs) panel. */
  (e: 'toggleGroupConfig'): void
  /** Feature config: toggle the Define Feature parameter panel. */
  (e: 'toggleFeatureConfig'): void
}>()

/* ── Tooltip hover state ────────────────────────────────────────── */
// Claude Sonnet 4.6: Track which button is hovered so only one tooltip shows
type ButtonKey = 'build' | 'run' | 'upload' | 'target' | 'save' | 'open' | 'settings' | null
</script>

<template>
  <div id="top-bar" class="toolbar" role="toolbar" aria-label="Node editor top toolbar">

    <!-- ── Left group: Build & Run ──────────────────────────────── -->
    <!-- Claude Sonnet 4.6: Left action group -->
    <div class="toolbar-group toolbar-group--left">
      <!-- Run button: the single filled primary action -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn toolbar-btn--primary" aria-label="Run"
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

      <!-- Upload button: build, then write the FeatureScript to a Feature Studio (#1) -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Upload"
          v-tooltip="{ label: 'Upload', description: 'Build the graph and write the result to the configured Feature Studio.' }"
          @click="emit('upload')">
          <SvgIcon href="#svg-icon-document-upload-cloud" :size="16" aria-label="Upload" />
          <span class="btn-label">Upload</span>
        </button>
      </div>

      <!-- Graph target: resolve the active graph's Feature Studio in the active document (#31) -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Graph target"
          v-tooltip="{ label: 'Graph Target', description: 'Resolve this graph\'s Feature Studio in the active document, or make a new node graph.' }"
          @click="emit('target')">
          <SvgIcon href="#svg-icon-feature-studio-element" :size="16" aria-label="Graph target" />
        </button>
      </div>

      <!-- New graph: an additional graph with its own studio and element (#31) -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="New graph"
          v-tooltip="{ label: 'New Graph', description: 'Create an additional node graph with its own Feature Studio and graph element.' }"
          @click="emit('newGraph')">
          <SvgIcon href="#svg-icon-add-button" :size="16" aria-label="New graph" />
        </button>
      </div>

      <!-- Create group from selection (#14): quiet ghost button, icon-first -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Create group from selection"
          v-tooltip="{ label: 'Create Group from Selection', description: 'Turn the selected nodes into a reusable node group. Select the instance and press Tab to edit it.' }"
          @click="emit('createGroup')">
          <SvgIcon href="#svg-icon-mateGroup" :size="16" aria-label="Create group from selection" />
        </button>
      </div>

      <!-- Group inputs/outputs (Start/End Feature) — only while editing a group.
           Icon + text: the icon alone was not discoverable. -->
      <div v-if="groupEditing" class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Group inputs and outputs"
          v-tooltip="{ label: 'Group Inputs and Outputs', description: 'Configure the Start Feature and End Feature sockets: add, rename, and retype the group inputs and outputs.' }"
          @click="emit('toggleGroupConfig')">
          <SvgIcon href="#svg-icon-mateGroup" :size="16" aria-label="Group inputs and outputs" />
          <span class="toolbar-btn-label">Group I/O</span>
        </button>
      </div>

      <!-- Feature parameters — only while a Define Feature node is selected -->
      <div v-if="featureSelected" class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Feature parameters" data-testid="feature-parameters-button"
          v-tooltip="{ label: 'Feature Parameters', description: 'Edit the Define Feature node: feature name and its input parameters (name + type).' }"
          @click="emit('toggleFeatureConfig')">
          <SvgIcon href="#svg-icon-feature-studio-element" :size="16" aria-label="Feature parameters" />
          <span class="toolbar-btn-label">Feature parameters</span>
        </button>
      </div>

      <!-- Run target: the Part Studio the generated feature is inserted into (#2) -->
      <div class="toolbar-btn-wrap">
        <button class="toolbar-btn" aria-label="Run target"
          v-tooltip="{ label: 'Run Target', description: 'Set the Part Studio that Run inserts the generated feature into.' }"
          @click="emit('runTarget')">
          <SvgIcon href="#svg-icon-partstudio" :size="16" aria-label="Run target" />
        </button>
      </div>

    </div>

    <!-- ── Centre: optional project name, or the group breadcrumb ── -->
    <div v-if="groupBreadcrumb && groupBreadcrumb.length > 1" class="toolbar-centre">
      <span class="project-name group-breadcrumb">{{ groupBreadcrumb.join(' / ') }}</span>
    </div>
    <div v-else-if="projectName" class="toolbar-centre">
      <span class="project-name">{{ projectName }}</span>
    </div>

    <!-- ── Right group: Save, Open, Settings ────────────────────── -->
    <!-- Claude Sonnet 4.6: Right action group -->
    <div class="toolbar-group toolbar-group--right">

      <!-- #30: always-visible design-rule check tab -->
      <DesignCheckTab v-if="log" :store="log" @locate-node="emit('locateNode', $event)" />
      <div v-if="log" class="toolbar-divider" aria-hidden="true" />

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
/* ── Toolbar ────────────────────────────────────────────────────────
   The palette lives once, in src/app/common.css (STYLE_GUIDE.md). This
   bar is icon-first: every button carries a 16px monochrome icon, ghost
   by default, and only the single primary action (Run) is filled.
   No command in the app has a keyboard shortcut yet, so no keycap chips
   are drawn here — inventing keybindings would be a behaviour change. */
.toolbar {
  --toolbar-height: 36px;
  display: flex;
  flex-direction: row;
  align-items: center;
  height: var(--toolbar-height);
  padding: 0 8px;
  user-select: none;
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--surface);
  border-bottom: 1px solid var(--border-hairline);
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
  font-size: var(--font-size-title);
  font-weight: 500;
  color: var(--text-secondary);
}

/* #14: the group editing breadcrumb replaces the project name while editing. */
.group-breadcrumb {
  color: var(--text-primary);
}

/* ── Divider ────────────────────────────────────────────────────── */
.toolbar-divider {
  width: 1px;
  height: 16px;
  background: var(--border-hairline);
  margin: 0 4px;
  flex-shrink: 0;
}

/* ── Button wrapper (position: relative for tooltip) ────────────── */
.toolbar-btn-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* ── Button base: ghost/flat ────────────────────────────────────── */
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-field);
  font-family: var(--font-sans);
  font-weight: 500;
  transition: background 0.1s ease, border-color 0.1s ease, color 0.1s ease;
  outline-offset: 2px;
}

.toolbar-btn:hover {
  background: var(--hover-tint);
  border-color: var(--border-hairline);
  color: var(--text-primary);
}

.toolbar-btn:active {
  background: var(--active-tint);
}

/* Keyboard-only ring (never on mouse click): 2px steel outline with a 2px
 * offset so it reads against the toolbar surface on BOTH the ghost buttons
 * (white) and the filled primary Run (accent fill — a border-only ring is
 * identical to the unfocused state there). #2f5f8f on white ≈ 6.7:1. */
.toolbar-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ── The one filled action ─────────────────────────────────────── */
.toolbar-btn--primary,
.toolbar-btn--primary:hover,
.toolbar-btn--primary:active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

.toolbar-btn--primary:hover {
  opacity: 0.92;
}

/* ── Label text (shown on Run / Build / Upload only) ────────────── */
.btn-label {
  font-size: var(--font-size-field);
  font-weight: 500;
}

/* Section affordance labels (Group I/O, Feature parameters): visible text
   so the panel they open is discoverable. */
.toolbar-btn-label {
  font-size: var(--font-size-field);
  font-weight: var(--font-weight-section);
  line-height: var(--line-height-title);
  white-space: nowrap;
}
</style>
