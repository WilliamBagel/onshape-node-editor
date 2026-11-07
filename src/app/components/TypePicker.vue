<!--
  TypePicker.vue
  Reusable value-type picker for the config panels (feature + group).

  The selected type is shown as a swatch dot (socket colour, data encoding)
  plus a dark-ink label on white — never coloured text — so every label meets
  >= 4.5:1 contrast. The popup listbox is at least 200px wide with nowrap
  labels, so the longest supported name (numberValueWithUnits) never clips.
  Keyboard: Enter/Space opens, ArrowUp/ArrowDown move, Enter selects,
  Escape closes, Tab closes.
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import SvgIcon from './SvgIcon.vue'
import { VALUE_TYPE_OPTIONS, socketColorFor } from './valueTypeMeta'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options?: readonly string[]
    ariaLabel?: string
    testId?: string
  }>(),
  {
    options: () => VALUE_TYPE_OPTIONS,
    ariaLabel: 'Value type',
    testId: 'type-picker',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const open = ref(false)
const activeIndex = ref(-1)
const buttonRef = ref<HTMLButtonElement | null>(null)
const listboxRef = ref<HTMLDivElement | null>(null)
const listboxId = `type-picker-listbox-${Math.random().toString(36).slice(2, 8)}`

const currentIndex = () => props.options.indexOf(props.modelValue)

function openPicker(): void {
  open.value = true
  activeIndex.value = Math.max(0, currentIndex())
  void nextTick(() => listboxRef.value?.focus())
}

function closePicker(returnFocus = true): void {
  open.value = false
  if (returnFocus) buttonRef.value?.focus()
}

function selectAt(index: number): void {
  const value = props.options[index]
  if (value == null) return
  if (value !== props.modelValue) {
    emit('update:modelValue', value)
    emit('change', value)
  }
  closePicker()
}

function onButtonKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    openPicker()
  }
}

function onListKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(props.options.length - 1, activeIndex.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(0, activeIndex.value - 1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectAt(activeIndex.value)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePicker()
  } else if (event.key === 'Tab') {
    closePicker(false)
  }
}

function onOutsideClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest?.('.type-picker') == null) closePicker(false)
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', onOutsideClick)
  else document.removeEventListener('mousedown', onOutsideClick)
})

onBeforeUnmount(() => document.removeEventListener('mousedown', onOutsideClick))
</script>

<template>
  <div class="type-picker" :data-testid="testId">
    <button
      ref="buttonRef"
      type="button"
      class="type-picker-btn"
      :data-testid="`${testId}-button`"
      :aria-label="ariaLabel"
      :aria-haspopup="true"
      :aria-expanded="open"
      :aria-controls="listboxId"
      @click="open ? closePicker(false) : openPicker()"
      @keydown="onButtonKeydown"
    >
      <span class="type-picker-dot" :style="{ background: socketColorFor(modelValue) }" aria-hidden="true"></span>
      <span class="type-picker-label">{{ modelValue || 'unknown' }}</span>
      <SvgIcon href="#svg-icon-arrow-down" :size="10" aria-label="Choose a value type" />
    </button>
    <div
      v-if="open"
      :id="listboxId"
      ref="listboxRef"
      class="type-picker-listbox"
      :data-testid="`${testId}-listbox`"
      role="listbox"
      :aria-label="ariaLabel"
      :aria-activedescendant="activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined"
      tabindex="-1"
      @keydown="onListKeydown"
    >
      <div
        v-for="(t, i) in options"
        :key="t"
        :id="`${listboxId}-${i}`"
        class="type-picker-option"
        :class="{ 'is-active': i === activeIndex, 'is-selected': t === modelValue }"
        data-testid="type-picker-option"
        role="option"
        :aria-selected="t === modelValue"
        :data-value="t"
        @mousedown.prevent="selectAt(i)"
        @mouseenter="activeIndex = i"
      >
        <span class="type-picker-dot" :style="{ background: socketColorFor(t) }" aria-hidden="true"></span>
        <span class="type-picker-option-label">{{ t }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.type-picker {
  position: relative;
  min-width: 0;
}

.type-picker-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 200px;
  height: 24px;
  padding: 0 6px;
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  color: var(--text-primary);
  background: var(--surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-control);
  box-sizing: border-box;
  cursor: pointer;
  white-space: nowrap;
}

.type-picker-btn:focus-visible {
  border-color: var(--accent-steel);
  outline: none;
}

.type-picker-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.type-picker-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  color: var(--text-primary);
}

.type-picker-listbox {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 40;
  min-width: 200px;
  max-width: 260px;
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-1);
  box-sizing: border-box;
}

.type-picker-listbox:focus-visible {
  outline: none;
  border-color: var(--accent-steel);
}

.type-picker-option {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 6px;
  border-radius: var(--radius-control);
  cursor: pointer;
  white-space: nowrap;
}

.type-picker-option.is-active {
  background: var(--hover-tint);
}

.type-picker-option.is-selected .type-picker-option-label {
  font-weight: var(--font-weight-section);
}

.type-picker-option-label {
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  color: var(--text-primary);
}
</style>
