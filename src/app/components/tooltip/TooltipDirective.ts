/**
 * TooltipDirective.ts
 * Authored by: Claude Sonnet 4.6 (Anthropic)
 *
 * A Vue 3 custom directive: `v-tooltip`
 *
 * Usage in any template:
 *
 *   <button v-tooltip="{ label: 'Build', description: 'Compile the graph.' }">
 *
 * Or with only a label:
 *
 *   <button v-tooltip="'Save File'">
 *
 * On mouseenter the directive reads the live DOMRect of the element
 * and passes it — along with the label/description — to showTooltip().
 * The singleton ToolTip.vue component (teleported to <body>) then
 * positions itself so it never clips against screen edges.
 *
 * Registration (in main.ts):
 *
 *   import { tooltipDirective } from './TooltipDirective'
 *   app.directive('tooltip', tooltipDirective)
 *
 * The ToolTip.vue singleton must be mounted somewhere in the app
 * (e.g. directly in App.vue) for the teleport target to exist.
 */

import type { Directive, DirectiveBinding } from 'vue'
import { showTooltip, hideTooltip } from './useTooltip'

/** Value accepted by v-tooltip */
type TooltipValue =
  | string
  | { label: string; description?: string }

/** Stored per-element so we can remove listeners on unmount */
interface TooltipHandlers {
  enter: () => void
  leave: () => void
}

// WeakMap keeps handler refs without leaking memory
const handlerMap = new WeakMap<HTMLElement, TooltipHandlers>()

function getContent(binding: DirectiveBinding<TooltipValue>): { label: string; description: string } {
  if (typeof binding.value === 'string') {
    return { label: binding.value, description: '' }
  }
  return {
    label: binding.value.label,
    description: binding.value.description ?? '',
  }
}

export const tooltipDirective: Directive<HTMLElement, TooltipValue> = {
  // Claude Sonnet 4.6: Attach listeners when directive is first bound
  mounted(el, binding) {
    const { label, description } = getContent(binding)

    const enter = () => {
      // Re-read rect at show time so position is always fresh
      showTooltip(el.getBoundingClientRect(), label, description)
    }
    const leave = () => hideTooltip()

    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', leave)
    // Also hide on focus loss for keyboard users
    el.addEventListener('blur', leave)

    handlerMap.set(el, { enter, leave })
  },

  // Claude Sonnet 4.6: Update label/description if binding value changes reactively
  updated(el, binding) {
    // Remove old listeners and re-attach with fresh values
    const old = handlerMap.get(el)
    if (old) {
      el.removeEventListener('mouseenter', old.enter)
      el.removeEventListener('mouseleave', old.leave)
      el.removeEventListener('blur', old.leave)
    }

    const { label, description } = getContent(binding)
    const enter = () => showTooltip(el.getBoundingClientRect(), label, description)
    const leave = () => hideTooltip()

    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', leave)
    el.addEventListener('blur', leave)

    handlerMap.set(el, { enter, leave })
  },

  // Claude Sonnet 4.6: Clean up on unmount to prevent memory leaks
  unmounted(el) {
    const handlers = handlerMap.get(el)
    if (handlers) {
      el.removeEventListener('mouseenter', handlers.enter)
      el.removeEventListener('mouseleave', handlers.leave)
      el.removeEventListener('blur', handlers.leave)
      handlerMap.delete(el)
    }
    // If this element was the one being hovered, clear the tooltip
    hideTooltip()
  },
}
