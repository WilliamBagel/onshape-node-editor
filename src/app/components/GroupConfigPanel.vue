<!--
  GroupConfigPanel.vue
  Blender-style group interface panel: Start Feature / End Feature sockets.

  Shown only while editing a group (App.vue toggles it). Lists the boundary
  inputs/outputs with editable names and value types, and offers member-node
  sockets that can still become boundary sockets. Edits are emitted to App.vue,
  which calls the editor controls and refreshes the boundary state — this
  component never touches the editor directly and uses no browser dialogs.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SvgIcon from './SvgIcon.vue'
import type { GroupBoundaryState } from '../rete/groups/group-editor'
import type { GroupSocketCandidate, GroupSocketDefinition } from '../rete/groups/groupmodel'

const props = defineProps<{
  /** Live boundary state from controls.getGroupBoundaryState(); null hides the panel. */
  state: GroupBoundaryState | null
}>()

const emit = defineEmits<{
  (e: 'update', payload: { socketId: string; direction: 'input' | 'output'; patch: { label?: string; valueType?: string } }): void
  (e: 'add', payload: { direction: 'input' | 'output'; nodeId: string; socketKey: string }): void
  (e: 'remove', payload: { socketId: string; direction: 'input' | 'output' }): void
  (e: 'close'): void
}>()

/** Value type choices offered for a boundary socket (display-only labels). */
const VALUE_TYPES: readonly string[] = [
  'unknown',
  'number',
  'ValueWithUnits',
  'boolean',
  'string',
  'Query',
  'Id',
  'Context',
  'Vector',
  'Matrix',
  'Transform',
  'CoordSystem',
  'map',
  'Enum',
  'array',
]

/** Draft label text per socket id, so typing does not fight the parent refresh. */
const labelDrafts = ref<Record<string, string>>({})
const selectedInput = ref('')
const selectedOutput = ref('')
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function syncDrafts(): void {
  if (props.state == null) return
  for (const socket of [...props.state.inputs, ...props.state.outputs]) {
    labelDrafts.value[rowKey(socket)] = socket.label
  }
}

watch(() => props.state, syncDrafts, { immediate: true, deep: true })

function rowKey(socket: GroupSocketDefinition): string {
  return `${socket.direction}:${socket.id}`
}

function sourceLabel(socket: GroupSocketDefinition): string {
  const all = props.state?.candidates
  const found = [...(all?.inputs ?? []), ...(all?.outputs ?? [])].find(
    (c) => c.nodeId === socket.nodeId && c.socketKey === socket.socketKey,
  )
  return found != null ? `${found.nodeTitle} › ${found.label}` : socket.socketKey
}

/** Debounce-free path: rename emits on blur, retype emits on change. */
function onLabelBlur(socket: GroupSocketDefinition): void {
  const next = labelDrafts.value[rowKey(socket)] ?? ''
  if (next !== socket.label) {
    emit('update', { socketId: socket.id, direction: socket.direction, patch: { label: next } })
  }
}

function onTypeChange(socket: GroupSocketDefinition, event: Event): void {
  const next = (event.target as HTMLSelectElement).value
  if (next !== (socket.valueType ?? 'unknown')) {
    emit('update', { socketId: socket.id, direction: socket.direction, patch: { valueType: next } })
  }
}

function candidateKey(c: GroupSocketCandidate): string {
  return `${c.nodeId} ${c.socketKey}`
}

function grouped(candidates: GroupSocketCandidate[]): { nodeTitle: string; items: GroupSocketCandidate[] }[] {
  const byTitle = new Map<string, GroupSocketCandidate[]>()
  for (const c of candidates) {
    const list = byTitle.get(c.nodeTitle) ?? []
    list.push(c)
    byTitle.set(c.nodeTitle, list)
  }
  return [...byTitle.entries()].map(([nodeTitle, items]) => ({ nodeTitle, items }))
}

const inputGroups = computed(() => grouped(props.state?.candidates?.inputs ?? []))
const outputGroups = computed(() => grouped(props.state?.candidates?.outputs ?? []))

function addSelected(direction: 'input' | 'output'): void {
  const selected = direction === 'input' ? selectedInput.value : selectedOutput.value
  if (selected === '') return
  const [nodeId, socketKey] = selected.split(' ')
  emit('add', { direction, nodeId, socketKey })
  if (direction === 'input') selectedInput.value = ''
  else selectedOutput.value = ''
}

function removeSocket(socket: GroupSocketDefinition): void {
  const key = rowKey(socket)
  const timer = timers.get(key)
  if (timer != null) clearTimeout(timer)
  timers.delete(key)
  emit('remove', { socketId: socket.id, direction: socket.direction })
}
</script>

<template>
  <aside
    v-if="state != null"
    data-testid="group-config-panel"
    class="group-config-panel"
    role="complementary"
    aria-label="Group inputs and outputs"
  >
    <div class="panel-header">
      <div class="panel-title">
        <SvgIcon href="#svg-icon-mateGroup" :size="16" aria-label="Node group" />
        <h2 class="panel-heading">{{ state.name }}</h2>
      </div>
      <button
        type="button"
        class="close-btn"
        aria-label="Close group configuration"
        data-testid="group-config-close"
        @click="emit('close')"
      >
        <SvgIcon href="#svg-icon-close-x" :size="12" aria-label="Close group configuration" />
      </button>
    </div>
    <p class="panel-meta">Start Feature / End Feature sockets for this group.</p>

    <section aria-labelledby="group-inputs-heading">
      <h3 id="group-inputs-heading" class="section-label">Inputs</h3>
      <p v-if="state.inputs.length === 0" class="empty-state">
        No inputs yet. Choose a member-node socket below and press + Input to expose it on the Start Feature.
      </p>
      <div
        v-for="socket in state.inputs"
        :key="rowKey(socket)"
        data-testid="group-input-row"
        class="socket-row"
      >
        <input
          v-model="labelDrafts[rowKey(socket)]"
          class="name-input"
          type="text"
          :aria-label="`Input name for ${socket.label}`"
          @blur="onLabelBlur(socket)"
        />
        <select
          class="type-select"
          :aria-label="`Type for input ${socket.label}`"
          :value="socket.valueType ?? 'unknown'"
          @change="onTypeChange(socket, $event)"
        >
          <option v-for="t in VALUE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <span class="source-label" :title="`Bound to ${socket.nodeId}.${socket.socketKey}`">
          {{ sourceLabel(socket) }}
        </span>
        <button
          type="button"
          class="remove-btn"
          :aria-label="`Remove input ${socket.label}`"
          @click="removeSocket(socket)"
        >
          <SvgIcon href="#svg-icon-close-x" :size="12" :aria-label="`Remove input ${socket.label}`" />
        </button>
      </div>
      <div class="add-row">
        <select
          v-model="selectedInput"
          class="candidate-select"
          aria-label="Member socket to expose as a group input"
        >
          <option value="">Select a member socket…</option>
          <optgroup v-for="group in inputGroups" :key="group.nodeTitle" :label="group.nodeTitle">
            <option v-for="c in group.items" :key="candidateKey(c)" :value="candidateKey(c)">
              {{ c.nodeTitle }} › {{ c.label }}
            </option>
          </optgroup>
        </select>
        <button
          type="button"
          data-testid="group-add-input"
          class="add-btn"
          aria-label="Add selected socket as a group input"
          :disabled="selectedInput === ''"
          @click="addSelected('input')"
        >
          + Input
        </button>
      </div>
    </section>

    <section aria-labelledby="group-outputs-heading">
      <h3 id="group-outputs-heading" class="section-label">Outputs</h3>
      <p v-if="state.outputs.length === 0" class="empty-state">
        No outputs yet. Choose a member-node socket below and press + Output to expose it on the End Feature.
      </p>
      <div
        v-for="socket in state.outputs"
        :key="rowKey(socket)"
        data-testid="group-output-row"
        class="socket-row"
      >
        <input
          v-model="labelDrafts[rowKey(socket)]"
          class="name-input"
          type="text"
          :aria-label="`Output name for ${socket.label}`"
          @blur="onLabelBlur(socket)"
        />
        <select
          class="type-select"
          :aria-label="`Type for output ${socket.label}`"
          :value="socket.valueType ?? 'unknown'"
          @change="onTypeChange(socket, $event)"
        >
          <option v-for="t in VALUE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <span class="source-label" :title="`Bound to ${socket.nodeId}.${socket.socketKey}`">
          {{ sourceLabel(socket) }}
        </span>
        <button
          type="button"
          class="remove-btn"
          :aria-label="`Remove output ${socket.label}`"
          @click="removeSocket(socket)"
        >
          <SvgIcon href="#svg-icon-close-x" :size="12" :aria-label="`Remove output ${socket.label}`" />
        </button>
      </div>
      <div class="add-row">
        <select
          v-model="selectedOutput"
          class="candidate-select"
          aria-label="Member socket to expose as a group output"
        >
          <option value="">Select a member socket…</option>
          <optgroup v-for="group in outputGroups" :key="group.nodeTitle" :label="group.nodeTitle">
            <option v-for="c in group.items" :key="candidateKey(c)" :value="candidateKey(c)">
              {{ c.nodeTitle }} › {{ c.label }}
            </option>
          </optgroup>
        </select>
        <button
          type="button"
          data-testid="group-add-output"
          class="add-btn"
          aria-label="Add selected socket as a group output"
          :disabled="selectedOutput === ''"
          @click="addSelected('output')"
        >
          + Output
        </button>
      </div>
    </section>
  </aside>
</template>

<style scoped>
.group-config-panel {
  position: fixed;
  top: auto;
  bottom: 160px;
  right: 8px;
  width: 300px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  padding: 12px;
  background: var(--surface-panel);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-1);
  font-family: var(--font-sans);
  color: var(--text-primary);
  box-sizing: border-box;
  z-index: 20;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.panel-heading {
  margin: 0;
  font-size: var(--font-size-heading);
  font-weight: var(--font-weight-title);
  line-height: var(--line-height-title);
  color: var(--text-primary);
}

.panel-meta {
  margin: 0 0 12px;
  font-size: var(--font-size-meta);
  line-height: var(--line-height-body);
  color: var(--text-secondary);
}

.section-label {
  margin: 12px 0 4px;
  font-size: var(--font-size-section);
  font-weight: var(--font-weight-section);
  line-height: var(--line-height-title);
}

.empty-state {
  margin: 0 0 8px;
  font-size: var(--font-size-label);
  line-height: var(--line-height-body);
  color: var(--text-secondary);
}

.socket-row {
  display: grid;
  grid-template-columns: 1fr 96px 16px;
  grid-template-rows: auto auto;
  gap: 4px 8px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
}

.name-input,
.type-select,
.candidate-select {
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  color: var(--text-primary);
  background: var(--surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-control);
  height: 24px;
  padding: 0 4px;
  box-sizing: border-box;
  min-width: 0;
}

.name-input:focus-visible,
.type-select:focus-visible,
.candidate-select:focus-visible {
  border-color: var(--accent-steel);
  outline: none;
}

.source-label {
  grid-column: 1 / 3;
  font-size: var(--font-size-meta);
  line-height: var(--line-height-body);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn,
.close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.remove-btn:hover,
.close-btn:hover {
  background: var(--hover-tint);
  border-color: var(--border-hairline);
  color: var(--text-primary);
}

.add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.candidate-select {
  flex: 1;
}

.add-btn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-section);
  cursor: pointer;
  white-space: nowrap;
}

.add-btn:hover:not(:disabled) {
  background: var(--hover-tint);
  color: var(--text-primary);
}

.add-btn:disabled {
  cursor: default;
  color: var(--text-secondary);
}
</style>
