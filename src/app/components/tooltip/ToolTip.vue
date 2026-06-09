<!--
  ToolTip.vue
  Authored by: Claude Sonnet 4.6 (Anthropic)

  Claude Sonnet 4.6 edit: Complete rewrite.
  This is now a SINGLETON teleported to <body> so it can never be
  clipped by an ancestor's overflow or stacking context.

  It is not used directly in templates. Instead, register the
  accompanying `v-tooltip` directive (TooltipDirective.ts) on any
  element and this component will receive the show/hide calls via
  the shared `tooltipState` composable (useTooltip.ts).

  Placement logic (no clipping):
    Primary axis  → below the trigger if trigger is in top half of viewport,
                    above if in bottom half.
    Secondary axis → tooltip is shifted left/right so it stays on-screen.
  The arrow is repositioned to always point back at the trigger centre.

  HTML structure matches the provided spec exactly:
    .tooltip.bs-tooltip-auto.fade.show[role=tooltip]
      .tooltip-arrow
      .tooltip-inner   (label)
      .tooltip-expand  (description, optional)
-->

<script setup lang="ts">
// Claude Sonnet 4.6: Import the shared state bus
import { tooltipState } from './useTooltip'
import { computed, ref, watch, nextTick } from 'vue'

// ── Internal refs ──────────────────────────────────────────────────
/** The rendered tooltip div — needed to measure its size */
const tooltipEl = ref<HTMLElement | null>(null)

/**
 * Computed pixel position + which side the arrow lives on.
 * Recalculated every time tooltipState.rect changes (i.e. on each show).
 */
const position = computed(() => {
  if (!tooltipState.visible || !tooltipState.rect) {
    return { top: 0, left: 0, arrowPlacement: 'top' as 'top' | 'bottom', arrowLeft: '50%' }
  }

  const GAP = 8            // px between trigger edge and tooltip
  const ARROW_SIZE = 6     // px (half-width of the CSS border arrow)
  const rect = tooltipState.rect
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Estimated tooltip dimensions before mount (we measure after nextTick for arrow nudge)
  const tW = tooltipEl.value?.offsetWidth  ?? 220
  const tH = tooltipEl.value?.offsetHeight ?? 60

  // Primary axis: prefer below when trigger centre is in top half, above otherwise
  const triggerCentreY = rect.top + rect.height / 2
  const placeBelow = triggerCentreY < vh / 2

  let top: number
  let arrowPlacement: 'top' | 'bottom'

  if (placeBelow) {
    // Tooltip appears below trigger; arrow points up (sits at tooltip top)
    top = rect.bottom + GAP
    arrowPlacement = 'top'
  } else {
    // Tooltip appears above trigger; arrow points down (sits at tooltip bottom)
    top = rect.top - tH - GAP
    arrowPlacement = 'bottom'
  }

  // Secondary axis: centre on trigger, then clamp to viewport with padding
  const EDGE_PAD = 8
  const idealLeft = rect.left + rect.width / 2 - tW / 2
  const clampedLeft = Math.min(Math.max(idealLeft, EDGE_PAD), vw - tW - EDGE_PAD)

  // Compute where the arrow should sit horizontally so it points at the trigger centre
  const triggerCentreX = rect.left + rect.width / 2
  const arrowLeftPx = Math.min(
    Math.max(triggerCentreX - clampedLeft, ARROW_SIZE + 4),
    tW - ARROW_SIZE - 4
  )

  return {
    top: Math.round(top),
    left: Math.round(clampedLeft),
    arrowPlacement,
    arrowLeft: `${arrowLeftPx}px`,
  }
})

// Re-measure after tooltip becomes visible so arrow nudge uses real dimensions
watch(() => tooltipState.visible, async (v) => {
  if (v) await nextTick() // let DOM render before reading offsetWidth/Height
})
</script>

<template>
  <!-- Claude Sonnet 4.6: Teleport to <body> to escape any overflow:hidden ancestors -->
  <Teleport to="body">
    <!--
      Exact class/role structure from spec:
        div.tooltip.bs-tooltip-auto.fade.show[role=tooltip]
          div.tooltip-arrow
          div.tooltip-inner
          div.tooltip-expand   (only when description present)
    -->
    <div
      v-if="tooltipState.visible"
      ref="tooltipEl"
      class="tooltip bs-tooltip-auto fade show"
      role="tooltip"
      :data-popper-placement="position.arrowPlacement === 'top' ? 'bottom' : 'top'"
      :style="{
        position: 'fixed',
        top: position.top + 'px',
        left: position.left + 'px',
        margin: '0',
        zIndex: 9999,
        pointerEvents: 'none',
      }"
    >
      <!-- Arrow; horizontal position adjusted to always point at trigger -->
      <div
        class="tooltip-arrow"
        :style="{
          position: 'absolute',
          left: position.arrowLeft,
          transform: 'translateX(-50%)',
          ...(position.arrowPlacement === 'top'
            ? { top: 0 }
            : { bottom: 0 }),
        }"
      />

      <!-- Primary label -->
      <div class="tooltip-inner">{{ tooltipState.label }}</div>

      <!-- Optional longer description -->
      <div v-if="tooltipState.description" class="tooltip-expand">
        {{ tooltipState.description }}
      </div>
    </div>
  </Teleport>
</template>

<style>
/*
  Claude Sonnet 4.6: Global (un-scoped) so the teleported node,
  which lives outside this component's scope, still gets the styles.
  Class names match the spec exactly.
*/

/* ── Fade animation ─────────────────────────────────────────────── */
.tooltip.fade {
  opacity: 0;
  transition: opacity 0.15s ease;
}
.tooltip.fade.show {
  opacity: 1;
}

/* ── Outer shell ────────────────────────────────────────────────── */
.tooltip.bs-tooltip-auto {
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  max-width: 260px;
}

/* ── Arrow ──────────────────────────────────────────────────────── */
/*
  The arrow is a CSS border triangle.
  data-popper-placement="bottom" → tooltip is below → arrow points UP (top side).
  data-popper-placement="top"    → tooltip is above → arrow points DOWN (bottom side).
*/
.tooltip.bs-tooltip-auto[data-popper-placement="bottom"] .tooltip-arrow::before {
  content: '';
  display: block;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid #1a1a1a;
  margin-top: -6px;
}

.tooltip.bs-tooltip-auto[data-popper-placement="top"] .tooltip-arrow::before {
  content: '';
  display: block;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid #1a1a1a;
  margin-bottom: -6px;
}

/* ── Tooltip body ───────────────────────────────────────────────── */
.tooltip-inner {
  background: #1a1a1a;
  color: #f0f0f0;
  border-radius: 5px 5px 0 0;
  padding: 5px 9px 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

/* When there is no expand section, round all corners */
.tooltip-inner:last-child {
  border-radius: 5px;
}

/* ── Optional description block ─────────────────────────────────── */
.tooltip-expand {
  background: #1a1a1a;
  color: #b0b0b0;
  border-radius: 0 0 5px 5px;
  padding: 2px 9px 6px;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
  white-space: normal;
  max-width: 220px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}
</style>
