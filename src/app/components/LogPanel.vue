<!--
  LogPanel.vue
  #4: the build/upload/run log surface.

  Renders a `BuildLogStore` (see ../logging/buildlog.ts). All shaping —
  entry construction, severity ordering, the copied text — lives in that plain
  module; this component only displays entries and calls the store/clipboard.

  Props:
    store - the live log owned by `App` (App.log)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  countBySeverity,
  formatTimestamp,
  isAtLeastSeverity,
  type LogEntry,
  type LogSeverity,
} from '../logging/buildlog'
import { BuildLogStore } from '../logging/buildlog'
import { copyTextToClipboard } from '../logging/clipboard'

const props = defineProps<{ store: BuildLogStore }>()

const entries = ref<readonly LogEntry[]>(props.store.entries)
const collapsed = ref(false)
const filter = ref<LogSeverity>('info')
/** Index (within the filtered list) of the entry whose detail is open. */
const openDetail = ref<number | null>(null)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const listElement = ref<HTMLElement | null>(null)

const counts = computed(() => countBySeverity(entries.value))
const visible = computed(() => entries.value.filter((entry) => isAtLeastSeverity(entry.severity, filter.value)))

let unsubscribe: (() => void) | null = null
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

function scrollToNewest(): void {
  const element = listElement.value
  if (element != null) element.scrollTop = element.scrollHeight
}

onMounted(() => {
  unsubscribe = props.store.subscribe((next) => {
    entries.value = next
    scrollToNewest()
  })
  scrollToNewest()
})

onBeforeUnmount(() => {
  unsubscribe?.()
  if (copyResetTimer !== null) clearTimeout(copyResetTimer)
})

async function copyAll(): Promise<void> {
  const ok = await copyTextToClipboard(props.store.copyText())
  copyState.value = ok ? 'copied' : 'failed'
  if (copyResetTimer !== null) clearTimeout(copyResetTimer)
  copyResetTimer = setTimeout(() => {
    copyState.value = 'idle'
  }, 1500)
}

function clearLog(): void {
  openDetail.value = null
  props.store.clear()
}

function toggleDetail(index: number): void {
  openDetail.value = openDetail.value === index ? null : index
}

function severityClass(severity: LogSeverity): string {
  return `entry--${severity}`
}
</script>

<template>
  <section class="log-panel" :class="{ 'log-panel--collapsed': collapsed }" aria-label="Build log">
    <header class="log-header">
      <button class="icon-btn" :aria-expanded="!collapsed" aria-label="Toggle build log"
        v-tooltip="{ label: collapsed ? 'Show log' : 'Hide log', description: 'Show or hide the build, upload and run log.' }"
        @click="collapsed = !collapsed">
        <span class="chevron" :class="{ 'chevron--collapsed': collapsed }" aria-hidden="true">▾</span>
      </button>
      <span class="log-title">Build Log</span>

      <div class="log-counts" aria-live="polite">
        <span class="count count--info" :title="`${counts.info} informational entries`">{{ counts.info }}</span>
        <span class="count count--warning" :title="`${counts.warning} warnings`">{{ counts.warning }}</span>
        <span class="count count--error" :title="`${counts.error} errors`">{{ counts.error }}</span>
      </div>

      <select v-model="filter" class="log-filter" aria-label="Minimum severity">
        <option value="info">All</option>
        <option value="warning">Warnings+</option>
        <option value="error">Errors</option>
      </select>

      <button class="text-btn" :disabled="entries.length === 0" aria-label="Copy log to clipboard"
        v-tooltip="{ label: 'Copy log', description: 'Copy every entry, including generated source, to the clipboard.' }"
        @click="copyAll">
        {{ copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy' }}
      </button>
      <button class="text-btn" :disabled="entries.length === 0" aria-label="Clear log" @click="clearLog">Clear</button>
    </header>

    <div v-show="!collapsed" ref="listElement" class="log-body">
      <p v-if="visible.length === 0" class="log-empty">
        {{ entries.length === 0 ? 'No build, upload or run output yet.' : 'Nothing at this severity.' }}
      </p>

      <ol v-else class="log-entries">
        <li v-for="(entry, index) in visible" :key="`${entry.timestamp}-${index}`" class="entry"
          :class="severityClass(entry.severity)">
          <div class="entry-line">
            <span class="entry-time">{{ formatTimestamp(entry.timestamp) }}</span>
            <span class="entry-severity">{{ entry.severity }}</span>
            <span class="entry-source">{{ entry.source }}</span>
            <span v-if="entry.nodeId" class="entry-node">node {{ entry.nodeId }}</span>
            <span class="entry-message">{{ entry.message }}</span>
          </div>
          <button v-if="entry.detail !== undefined" class="detail-toggle" @click="toggleDetail(index)">
            {{ openDetail === index ? 'Hide' : 'Show' }} {{ entry.detailLabel ?? 'details' }}
          </button>
          <pre v-if="entry.detail !== undefined && openDetail === index" class="entry-detail">{{ entry.detail }}</pre>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.log-panel {
  position: fixed;
  right: 12px;
  bottom: 40px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  width: 520px;
  max-width: calc(100vw - 24px);
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  color: #3a3a3a;
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 6px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
  user-select: none;
}

.log-panel--collapsed .log-header {
  border-bottom: none;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #3a3a3a;
  cursor: pointer;
}

.icon-btn:hover {
  background: #ebebeb;
}

.chevron {
  display: inline-block;
  font-size: 10px;
  line-height: 1;
  transition: transform 0.1s ease;
}

.chevron--collapsed {
  transform: rotate(-90deg);
}

.log-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.log-counts {
  display: inline-flex;
  gap: 4px;
  margin-left: 4px;
}

.count {
  min-width: 16px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.count--info {
  background: #eef2f7;
  color: #52606d;
}

.count--warning {
  background: #fdf1dc;
  color: #8a5a00;
}

.count--error {
  background: #fbe4e4;
  color: #a32626;
}

.log-filter {
  margin-left: auto;
  height: 20px;
  border: 1px solid #dcdcdc;
  border-radius: 4px;
  background: #ffffff;
  font-size: 10px;
  font-family: inherit;
  color: inherit;
}

.text-btn {
  height: 20px;
  padding: 0 6px;
  border: 1px solid #dcdcdc;
  border-radius: 4px;
  background: #ffffff;
  font-size: 10px;
  font-family: inherit;
  font-weight: 500;
  color: inherit;
  cursor: pointer;
}

.text-btn:hover:not(:disabled) {
  background: #ebebeb;
}

.text-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.log-body {
  max-height: 45vh;
  overflow-y: auto;
  padding: 4px 0;
  background: #ffffff;
}

.log-empty {
  margin: 8px 10px;
  font-size: 11px;
  color: #8a8a8a;
}

.log-entries {
  margin: 0;
  padding: 0;
  list-style: none;
}

.entry {
  padding: 3px 10px 3px 8px;
  border-left: 3px solid transparent;
  font-size: 11px;
  line-height: 1.45;
}

.entry + .entry {
  border-top: 1px solid #f1f1f1;
}

.entry--info {
  border-left-color: #b6c2ce;
}

.entry--warning {
  border-left-color: #d99a1b;
  background: #fffbf2;
}

.entry--error {
  border-left-color: #c33b3b;
  background: #fdf5f5;
}

.entry-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.entry-time {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 10px;
  color: #8a8a8a;
  font-variant-numeric: tabular-nums;
}

.entry-severity {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.entry--info .entry-severity {
  color: #5b6b7c;
}

.entry--warning .entry-severity {
  color: #8a5a00;
}

.entry--error .entry-severity {
  color: #a32626;
}

.entry-source {
  font-size: 10px;
  font-weight: 600;
  color: #4a4a4a;
}

.entry-node {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 10px;
  color: #6b6b6b;
}

.entry-message {
  flex: 1 1 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.detail-toggle {
  margin-top: 2px;
  padding: 0;
  border: none;
  background: transparent;
  color: #2f6fbe;
  font-size: 10px;
  font-family: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.entry-detail {
  margin: 4px 0 2px;
  padding: 6px 8px;
  max-height: 160px;
  overflow: auto;
  background: #f6f8fa;
  border: 1px solid #e4e8ec;
  border-radius: 4px;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 10px;
  line-height: 1.4;
  white-space: pre;
}
</style>
