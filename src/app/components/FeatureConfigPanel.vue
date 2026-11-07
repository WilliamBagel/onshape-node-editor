<!--
  FeatureConfigPanel.vue
  Feature-signature editor for a DefineFeatureNode (Define Feature).

  Mirrors GroupConfigPanel's visual language (hairline, 4–5px radius,
  surface-panel background). Shows the feature name (editable; applied to
  the node title + annotation) and the Parameters list: rename, retype and
  remove per parameter, plus an add row (name + type + Add parameter). No
  browser dialogs and no member-socket dropdown — parameters are free-form
  preconditions, bound by name/type. Emits to App.vue, which calls the
  editor controls; this component never touches the editor directly.
-->
<script setup lang="ts">
import { ref, watch } from 'vue'
import SvgIcon from './SvgIcon.vue'
import TypePicker from './TypePicker.vue'
import type { DefineFeatureState } from '../rete/nodes/definefeaturenode'

const props = defineProps<{
  /** Live feature state from controls.getDefineFeatureState(); null hides the panel. */
  state: DefineFeatureState | null
}>()

const emit = defineEmits<{
  (e: 'update-name', name: string): void
  (e: 'add', payload: { name: string; valueType: string }): void
  (e: 'update-param', payload: { socketKey: string; patch: { name?: string; valueType?: string } }): void
  (e: 'remove-param', payload: { socketKey: string }): void
  (e: 'close'): void
}>()

const nameDraft = ref('')
const paramDrafts = ref<Record<string, string>>({})
const newParamName = ref('')
const newParamType = ref('string')

function syncDrafts(): void {
  if (props.state == null) return
  nameDraft.value = props.state.featureName
  for (const param of props.state.parameters) {
    paramDrafts.value[param.socketKey] = param.name
  }
}

watch(() => props.state, syncDrafts, { immediate: true, deep: true })

function onNameBlur(): void {
  if (props.state != null && nameDraft.value.trim() !== '' && nameDraft.value !== props.state.featureName) {
    emit('update-name', nameDraft.value.trim())
  }
}

function onParamBlur(socketKey: string, currentName: string): void {
  const next = (paramDrafts.value[socketKey] ?? '').trim()
  if (next !== '' && next !== currentName) {
    emit('update-param', { socketKey, patch: { name: next } })
  }
}

function onParamType(socketKey: string, valueType: string): void {
  emit('update-param', { socketKey, patch: { valueType } })
}

function addParameter(): void {
  const name = newParamName.value.trim()
  if (name === '') return
  emit('add', { name, valueType: newParamType.value })
  newParamName.value = ''
}

function removeParameter(socketKey: string): void {
  emit('remove-param', { socketKey })
}
</script>

<template>
  <aside
    v-if="state != null"
    data-testid="feature-config-panel"
    class="feature-config-panel"
    role="complementary"
    aria-label="Feature parameters"
  >
    <div class="panel-header">
      <div class="panel-title">
        <SvgIcon href="#svg-icon-feature-studio-element" :size="16" aria-label="Feature definition" />
        <h2 class="panel-heading">Feature parameters</h2>
      </div>
      <div class="header-actions">
        <button
          type="button"
          class="collapse-btn"
          aria-label="Collapse feature parameters"
          data-testid="feature-config-collapse"
          @click="emit('close')"
        >
          <SvgIcon href="#svg-icon-arrow-down" :size="12" aria-label="Collapse feature parameters" />
        </button>
        <button
          type="button"
          class="close-btn"
          aria-label="Close feature parameters"
          data-testid="feature-config-close"
          @click="emit('close')"
        >
          <SvgIcon href="#svg-icon-close-x" :size="12" aria-label="Close feature parameters" />
        </button>
      </div>
    </div>

    <label class="field-label" for="feature-name-input">Feature name</label>
    <input
      id="feature-name-input"
      v-model="nameDraft"
      class="name-input"
      type="text"
      data-testid="feature-name-input"
      aria-label="Feature name"
      @blur="onNameBlur"
    />

    <section aria-labelledby="feature-parameters-heading">
      <h3 id="feature-parameters-heading" class="section-label">Parameters</h3>
      <p v-if="state.parameters.length === 0" class="empty-state">
        No parameters yet. Add one below — it becomes an output socket on this node.
      </p>
      <div
        v-for="param in state.parameters"
        :key="param.socketKey"
        data-testid="feature-param-row"
        :data-socket-key="param.socketKey"
        class="socket-row"
      >
        <input
          v-model="paramDrafts[param.socketKey]"
          class="name-input"
          type="text"
          :aria-label="`Parameter name for ${param.name}`"
          @blur="onParamBlur(param.socketKey, param.name)"
        />
        <TypePicker
          :model-value="param.valueType"
          :aria-label="`Type for parameter ${param.name}`"
          :test-id="`feature-param-type-${param.socketKey}`"
          @update:model-value="(value: string) => onParamType(param.socketKey, value)"
        />
        <button
          type="button"
          class="remove-btn"
          :aria-label="`Remove parameter ${param.name}`"
          data-testid="feature-param-remove"
          @click="removeParameter(param.socketKey)"
        >
          <SvgIcon href="#svg-icon-close-x" :size="12" :aria-label="`Remove parameter ${param.name}`" />
        </button>
        <span class="source-label" :title="param.socketKey">{{ param.socketKey }}</span>
      </div>
      <div class="add-row">
        <input
          v-model="newParamName"
          class="name-input"
          type="text"
          placeholder="New parameter name…"
          aria-label="Name for a new feature parameter"
          data-testid="feature-new-param-name"
        />
        <TypePicker
          v-model="newParamType"
          aria-label="Type for a new feature parameter"
          test-id="feature-new-param-type"
        />
        <button
          type="button"
          data-testid="feature-add-param"
          class="add-btn"
          aria-label="Add parameter"
          :disabled="newParamName.trim() === ''"
          @click="addParameter"
        >
          + Add parameter
        </button>
      </div>
      <p class="panel-meta">Parameters become output sockets named definition.&lt;name&gt;. Rename re-keys the socket; wires on the old key are removed.</p>
    </section>
  </aside>
</template>

<style scoped>
.feature-config-panel {
  position: fixed;
  top: auto;
  bottom: 160px;
  right: 8px;
  width: 360px;
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

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.field-label {
  display: block;
  margin: 8px 0 4px;
  font-size: var(--font-size-section);
  font-weight: var(--font-weight-section);
  line-height: var(--line-height-title);
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

.panel-meta {
  margin: 8px 0 0;
  font-size: var(--font-size-meta);
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

.add-row {
  display: grid;
  grid-template-columns: 1fr 168px auto;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
}

.name-input {
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  color: var(--text-primary);
  background: var(--surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-control);
  height: 24px;
  padding: 0 6px;
  box-sizing: border-box;
  min-width: 0;
}

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
  font-family: var(--font-mono);
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
