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
import { ref, watch } from 'vue'
import SvgIcon from './SvgIcon.vue'
import TypePicker from './TypePicker.vue'
import type { GroupBoundaryState } from '../rete/groups/group-editor'
import type { GroupSocketDefinition } from '../rete/groups/groupmodel'

const props = defineProps<{
  /** Live boundary state from controls.getGroupBoundaryState(); null hides the panel. */
  state: GroupBoundaryState | null
}>()

const emit = defineEmits<{
  (e: 'update', payload: { socketId: string; direction: 'input' | 'output'; patch: { label?: string; valueType?: string } }): void
  (e: 'add-any', payload: { direction: 'input' | 'output'; label: string; valueType: string }): void
  (e: 'remove', payload: { socketId: string; direction: 'input' | 'output' }): void
  (e: 'close'): void
}>()

/** Draft label text per socket id, so typing does not fight the parent refresh. */
const labelDrafts = ref<Record<string, string>>({})
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

function isBound(socket: GroupSocketDefinition): boolean {
  return socket.nodeId != null && socket.socketKey != null
}

function sourceLabel(socket: GroupSocketDefinition): string {
  if (!isBound(socket)) {
    return 'Unbound — drag it onto a member node to bind it'
  }
  return socket.socketKey ?? ''
}

/** Debounce-free path: rename emits on blur, retype emits on change. */
function onLabelBlur(socket: GroupSocketDefinition): void {
  const next = labelDrafts.value[rowKey(socket)] ?? ''
  if (next !== socket.label) {
    emit('update', { socketId: socket.id, direction: socket.direction, patch: { label: next } })
  }
}

function onTypeChange(socket: GroupSocketDefinition, next: string): void {
  if (next !== (socket.valueType ?? 'unknown')) {
    emit('update', { socketId: socket.id, direction: socket.direction, patch: { valueType: next } })
  }
}

const anyInputLabel = ref('')
const anyOutputLabel = ref('')
const anyInputType = ref('unknown')
const anyOutputType = ref('unknown')

/** Create an arbitrary (unbound) socket; the user binds it by dragging. */
function addAny(direction: 'input' | 'output'): void {
  const label = direction === 'input' ? anyInputLabel.value : anyOutputLabel.value
  const valueType = direction === 'input' ? anyInputType.value : anyOutputType.value
  emit('add-any', { direction, label: label.trim() || (direction === 'input' ? 'input' : 'output'), valueType })
  if (direction === 'input') anyInputLabel.value = ''
  else anyOutputLabel.value = ''
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
      <div class="header-actions">
        <button
          type="button"
          class="collapse-btn"
          aria-label="Collapse group configuration"
          data-testid="group-config-collapse"
          @click="emit('close')"
        >
          <SvgIcon href="#svg-icon-arrow-down" :size="12" aria-label="Collapse group configuration" />
        </button>
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
    </div>
    <p class="panel-meta">Start Feature / End Feature sockets for this group. Bind sockets by dragging wires on the canvas.</p>

    <section aria-labelledby="group-inputs-heading">
      <h3 id="group-inputs-heading" class="section-label">Inputs</h3>
      <p v-if="state.inputs.length === 0" class="empty-state">
        No inputs yet. Add one below, then drag it onto a member node to bind it.
      </p>
      <div
        v-for="socket in state.inputs"
        :key="rowKey(socket)"
        data-testid="group-input-row"
        :data-bound="isBound(socket)"
        class="socket-row"
      >
        <input
          v-model="labelDrafts[rowKey(socket)]"
          class="name-input"
          type="text"
          :aria-label="`Input name for ${socket.label}`"
          @blur="onLabelBlur(socket)"
        />
        <TypePicker
          :model-value="socket.valueType ?? 'unknown'"
          :aria-label="`Type for input ${socket.label}`"
          test-id="group-row-type-picker"
          @update:model-value="(value: string) => onTypeChange(socket, value)"
        />
        <span class="source-label" :title="isBound(socket) ? `Bound to ${socket.nodeId}.${socket.socketKey}` : 'Unbound'">
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
        <input
          v-model="anyInputLabel"
          class="name-input"
          type="text"
          placeholder="New input name…"
          aria-label="Label for a new group input"
        />
        <TypePicker
          v-model="anyInputType"
          aria-label="Type for a new group input"
          test-id="group-add-input-type"
        />
        <button
          type="button"
          data-testid="group-add-input"
          class="add-btn"
          aria-label="Add a new unbound group input"
          @click="addAny('input')"
        >
          + Add input
        </button>
      </div>
    </section>

    <section aria-labelledby="group-outputs-heading">
      <h3 id="group-outputs-heading" class="section-label">Outputs</h3>
      <p v-if="state.outputs.length === 0" class="empty-state">
        No outputs yet. Add one below, then drag it onto a member node to bind it.
      </p>
      <div
        v-for="socket in state.outputs"
        :key="rowKey(socket)"
        data-testid="group-output-row"
        :data-bound="isBound(socket)"
        class="socket-row"
      >
        <input
          v-model="labelDrafts[rowKey(socket)]"
          class="name-input"
          type="text"
          :aria-label="`Output name for ${socket.label}`"
          @blur="onLabelBlur(socket)"
        />
        <TypePicker
          :model-value="socket.valueType ?? 'unknown'"
          :aria-label="`Type for output ${socket.label}`"
          test-id="group-row-type-picker"
          @update:model-value="(value: string) => onTypeChange(socket, value)"
        />
        <span class="source-label" :title="isBound(socket) ? `Bound to ${socket.nodeId}.${socket.socketKey}` : 'Unbound'">
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
        <input
          v-model="anyOutputLabel"
          class="name-input"
          type="text"
          placeholder="New output name…"
          aria-label="Label for a new group output"
        />
        <TypePicker
          v-model="anyOutputType"
          aria-label="Type for a new group output"
          test-id="group-add-output-type"
        />
        <button
          type="button"
          data-testid="group-add-output"
          class="add-btn"
          aria-label="Add a new unbound group output"
          @click="addAny('output')"
        >
          + Add output
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
  width: 340px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  padding: 10px;
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
  grid-template-columns: 1fr 168px 24px;
  grid-template-rows: auto auto;
  gap: 4px 6px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
}

.name-input {
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  color: var(--text-primary);
  background: var(--surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-control);
  height: 24px;
  padding: 0 2px;
  box-sizing: border-box;
  min-width: 0;
}

.type-picker { min-width: 0; }

.name-input:focus-visible {
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
.collapse-btn,
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
.collapse-btn:hover,
.close-btn:hover {
  background: var(--hover-tint);
  border-color: var(--border-hairline);
  color: var(--text-primary);
}

.add-row {
  display: grid;
  grid-template-columns: 1fr 150px 24px;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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

/* Keyboard-only ring on every panel button (never on mouse click):
 * 2px steel outline with a 2px offset. #2f5f8f on white ≈ 6.7:1. */
.group-config-panel button:focus-visible {
  outline: 2px solid var(--accent-steel);
  outline-offset: 2px;
}
</style>
