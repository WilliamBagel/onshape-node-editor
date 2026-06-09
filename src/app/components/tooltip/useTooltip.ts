/**
 * useTooltip.ts
 * Authored by: Claude Sonnet 4.6 (Anthropic)
 *
 * Shared reactive state bus for the body-teleported tooltip system.
 *
 * The v-tooltip directive writes into `tooltipState` on mouseenter/mouseleave.
 * The singleton ToolTip.vue component reads from it to decide what to render
 * and where to position itself.
 *
 * Using a plain `reactive` object (module-level singleton) means there is
 * exactly one tooltip visible at a time, which matches the desired UX.
 */

import { reactive } from 'vue'

/** The shared state read by ToolTip.vue and written by TooltipDirective.ts */
export const tooltipState = reactive<{
  visible: boolean
  label: string
  description: string
  /** Bounding rect of the currently hovered trigger element */
  rect: DOMRect | null
}>({
  visible: false,
  label: '',
  description: '',
  rect: null,
})

/**
 * Show the tooltip anchored to `rect` with the given content.
 * Called by the v-tooltip directive on mouseenter.
 */
export function showTooltip(rect: DOMRect, label: string, description = '') {
  tooltipState.rect = rect
  tooltipState.label = label
  tooltipState.description = description
  tooltipState.visible = true
}

/**
 * Hide the tooltip.
 * Called by the v-tooltip directive on mouseleave / focus-out.
 */
export function hideTooltip() {
  tooltipState.visible = false
  tooltipState.rect = null
}
