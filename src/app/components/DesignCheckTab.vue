<!--
  DesignCheckTab.vue
  #30: the always-visible design-rule check surface in the top bar.

  The checks are derived from `BuildLogStore` — the one place build, upload, run
  and editor warnings already land — rather than from a second set of flags.
  The tab shows the highest severity and the count, opens a list of checks, and
  offers "Locate" for rows that name a node. A graph nobody has built yet shows
  "unchecked", never a green check.

  Props:
    store - the App-owned BuildLogStore
  Emits:
    locateNode(nodeId) - the user asked to select a node in the canvas
-->

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BuildLogStore } from '../logging/buildlog'
import { collectDesignChecks, hasPipelineRun, summarizeDesignChecks } from '../logging/designcheck'
import SvgIcon, { type OnshapeSvgIcon } from './SvgIcon.vue'

const props = defineProps<{ store: BuildLogStore }>()
const emit = defineEmits<{ (e: 'locateNode', nodeId: string): void }>()

const open = ref(false)
const entries = ref(props.store.entries)

let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = props.store.subscribe((next) => {
    entries.value = next
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
})

const checks = computed(() => collectDesignChecks(entries.value))
const summary = computed(() => summarizeDesignChecks(checks.value, hasPipelineRun(entries.value)))

/** Icon and label per reported state. */
const presentation = computed<{ icon: OnshapeSvgIcon; label: string; tone: string }>(() => {
  switch (summary.value.state) {
    case 'error':
      return { icon: '#svg-icon-list-error-inside', label: 'Design checks', tone: 'error' }
    case 'warning':
      return { icon: '#svg-icon-list-error-overlay', label: 'Design checks', tone: 'warning' }
    case 'clean':
      return { icon: '#svg-icon-green-check', label: 'Design checks', tone: 'clean' }
    default:
      return { icon: '#svg-icon-info', label: 'Design checks', tone: 'unchecked' }
  }
})

const countLabel = computed(() => {
  if (summary.value.state === 'unchecked') return '—'
  if (summary.value.state === 'clean') return '0'
  return String(summary.value.total)
})

function toggle(): void {
  open.value = !open.value
}

function locate(nodeId: string): void {
  open.value = false
  emit('locateNode', nodeId)
}
</script>

<template>
  <div class="drc-tab-wrap">
    <button class="drc-tab" :class="`drc-tab--${presentation.tone}`" aria-haspopup="true" :aria-expanded="open"
      :aria-label="`${presentation.label}: ${summary.state}`"
      v-tooltip="{ label: presentation.label, description: summary.state === 'unchecked' ? 'No build, run or upload has checked this graph yet.' : `${summary.counts.error} errors, ${summary.counts.warning} warnings.` }"
      @click="toggle">
      <SvgIcon :href="presentation.icon" :size="16" aria-hidden="true" />
      <span class="drc-label">{{ presentation.label }}</span>
      <span class="drc-count" :class="`drc-count--${presentation.tone}`">{{ countLabel }}</span>
    </button>

    <div v-if="open" class="drc-panel" role="dialog" aria-label="Design check results">
      <p v-if="summary.state === 'unchecked'" class="drc-empty">
        Nothing has checked this graph yet. Build, Run or Upload runs the checks.
      </p>
      <p v-else-if="summary.state === 'clean'" class="drc-empty">
        No design-rule violations in this graph.
      </p>
      <ul v-else class="drc-list">
        <li v-for="check in checks" :key="check.id" class="drc-item" :class="`drc-item--${check.severity}`">
          <span class="drc-item-severity">{{ check.severity }}</span>
          <span class="drc-item-source">{{ check.source }}</span>
          <span class="drc-item-message">{{ check.message }}</span>
          <button v-if="check.nodeId" class="drc-locate" @click="locate(check.nodeId)">
            Locate
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.drc-tab-wrap {
  position: relative;
  display: inline-flex;
}

.drc-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.drc-tab:hover {
  border-color: var(--hairline-strong);
}

.drc-label {
  font-weight: 600;
}

.drc-count {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--ink);
  opacity: var(--opacity-secondary);
}

.drc-count--error {
  color: var(--error);
  font-weight: 600;
}

.drc-count--warning {
  color: var(--warning);
  font-weight: 600;
}

.drc-count--clean {
  color: var(--flow-teal);
}

.drc-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  width: 360px;
  max-height: 320px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.drc-empty {
  margin: 4px;
  color: var(--ink);
  opacity: var(--opacity-secondary);
  font-size: 12px;
}

.drc-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.drc-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--hairline);
  font-size: 11px;
  color: var(--ink);
}

.drc-item:last-child {
  border-bottom: none;
}

.drc-item-severity {
  min-width: 52px;
  font-weight: 600;
}

.drc-item--error .drc-item-severity {
  color: var(--error);
}

.drc-item--warning .drc-item-severity {
  color: var(--warning);
}

.drc-item-source {
  color: var(--ink);
  opacity: var(--opacity-secondary);
}

.drc-item-message {
  flex: 1;
  overflow-wrap: anywhere;
}

.drc-locate {
  border: none;
  background: transparent;
  color: var(--accent-steel);
  font-family: inherit;
  font-size: 11px;
  text-decoration: underline;
  cursor: pointer;
}
</style>
