<template>
  <div id="feature-dialog" class="ns-dialog-panel feature-dialog node" :class="{ selected: data.selected, collapsed }" :style="{
    // Collapsed nodes are content-sized in BOTH axes: the inline width and
    // max-width would cap the socket grid's overflow columns, so the card
    // grows horizontally to fit them instead of clipping.
    'width': !collapsed && Number.isFinite(width) ? `${width}px` : '',
    // Collapsed nodes are content-sized: skip the expanded height
    // entirely instead of pinning it inline and relying on
    // `height:auto !important` to beat it. Expanding restores it.
    'height': !collapsed && Number.isFinite(height) ? `${height}px` : '',
    'min-width': collapsedMinWidth() != null ? `${collapsedMinWidth()}px` : '',
    'max-width': !collapsed && Number.isFinite(data.maxWidth) ? `${data.maxWidth}px` : ''
  }" data-testid="node">
    <div class="feature-dialog-main ns-dialog-frame">
      <div class="ns-dialog-header" role="dialog" data-backdrop="false">
        <div class="ns-drag-area">
          <div class="ns-dialog-title-container node-title-container">
            <button type="button" class="node-header-button node-collapse-toggle" @click="toggleCollapsed"
              @pointerdown.stop :aria-label="collapsed ? 'Expand node' : 'Collapse node'"
              :aria-expanded="!collapsed">
              <svg class="node-collapse-icon" :class="{ expanded: !collapsed }" viewBox="0 0 12 12" width="14" height="14" aria-hidden="true">
                <path d="M2 4.5 6 9l4-4.5z" fill="currentColor" />
              </svg>
            </button>
            <div class="ns-dialog-title node-title" data-bs-placement="right" style="user-select: none;"
              v-show="!titleEditFocus" @pointerdown="onTitlePress" @click="onTitleClick" @dblclick="focusTitleEdit">{{
                title }}</div>
            <input maxlength="256" class="os-dialog-header-rename-textbox node-title-editor" ref="titleEditElem"
              v-model="titleDraft" v-show="titleEditFocus" @blur="onTitleEditBlur" @keydown="onTitleEditKeydown"
              @pointerdown.stop>
            <button type="button" class="os-dialog-button-edit-name node-header-button node-title-edit-toggle"
              @click="focusTitleEdit" @pointerdown.stop aria-label="Rename node">
              <svg class="os-svg-icon osc-svg-vertical-align" style="display: inline-flex;">
                <use href="#svg-icon-edit-button"></use>
              </svg>
            </button>
          </div>
          <div class="ns-dialog-edit-hover-area"></div>
        </div>
        <!-- <div class="ns-dialog-button-ok button-ok">
          <svg class="os-svg-icon osc-svg-vertical-align" style="display: inline-flex;">
            <use href="#svg-icon-ok-button"></use>
          </svg>
        </div>
        <div class="ns-dialog-button-cancel backbone-cancel">
          <svg class="os-svg-icon osc-svg-vertical-align" style="display: inline-flex;">
            <use href="#svg-icon-cancel-button"></use>
          </svg>
        </div> -->
      </div>
      <div class="dialog-content" v-if="!collapsed">
        <p v-if="(data as any).genericDefinition === true" class="generic-definition-warning"
          data-testid="generic-definition-warning" role="note">
          Generic definition — definition map schema not known; generated code uses an empty map.
        </p>
        <p v-if="boundaryEmptyText() != null" class="boundary-empty-hint" data-testid="boundary-empty-hint">
          {{ boundaryEmptyText() }}
        </p>
        <!-- Outputs-->
        <div class="output os-parameter-list-item os-param-fill-first-column" v-for="[key, output] in outputs()"
          :key="'output' + key + seed" :data-testid="'output-' + key">
          <TranslateLock>
            <Ref class="output-socket os-param-subgroup-row" :emit="proxyEmit"
              :data="{ type: 'socket', side: 'output', key: key, btType: output.type, nodeId: data.id, payload: output }"
              data-testid="output-socket" />
          </TranslateLock>
          <div class="os-param-wrapper os-param-container" style="width:100%">
            <div class="output-title os-param-label" data-testid="output-title">{{
              output.label
            }}
            </div>
          </div>
        </div>
        <!-- Controls-->
        <Ref class="control" v-for="[key, control] in controls()" :key="'control' + key + seed" :emit="proxyEmit"
          :data="{ type: 'control', payload: control }" :data-testid="'control-' + key" />
        <!-- Inputs-->
        <template v-for="[key, input] in visibleInputs()" :key="'input' + key + seed">
          <OnshapeInputMap v-if="isMapInput(input)" :mapKey="key" :input="input" :nodeId="data.id" :emit="proxyEmit"
            :seed="seed" @value-change="controlValueChange(input, $event)" />
          <OnshapeInput v-else :inputKey="key" :input="input" :nodeId="data.id" :emit="proxyEmit"
            @value-change="controlValueChange(input, $event)" />
        </template>
      </div>
      <!-- Compact Blender-style socket strip while collapsed: up to three
           rows per side, overflowing into extra columns (inputs right,
           outputs left) instead of growing the card downwards. -->
      <div class="collapsed-socket-strip" v-if="collapsed" data-testid="collapsed-socket-strip"
        :aria-label="`Collapsed ${title} — ${collapsedInputs().length + collapsedOutputs().length} sockets`">
        <span class="collapsed-socket-group collapsed-socket-inputs"
          :style="collapsedRowsStyle(collapsedInputs().length)">
          <Ref v-for="socket in collapsedInputs()" :key="'collapsed-in-' + socket.key + seed" class="collapsed-socket"
            :emit="proxyEmit"
            :data="{ type: 'socket', side: 'input', key: socket.key, btType: socket.btType, nodeId: data.id, payload: socket.payload }"
            data-testid="collapsed-input-socket" />
        </span>
        <span class="collapsed-socket-group collapsed-socket-outputs"
          :style="collapsedRowsStyle(collapsedOutputs().length)">
          <Ref v-for="socket in collapsedOutputs()" :key="'collapsed-out-' + socket.key + seed" class="collapsed-socket"
            :emit="proxyEmit"
            :data="{ type: 'socket', side: 'output', key: socket.key, btType: socket.btType, nodeId: data.id, payload: socket.payload }"
            data-testid="collapsed-output-socket" />
        </span>
      </div>
      <div class="dialog-help-container"><a class="os-help-link os-center-content"
          href="./probably-a-popup-here-instead.error" target="help" aria-label="Open FeatureScript help" title="Help"><svg class="os-svg-icon os-help-btn"
            xmlns="http://www.w3.org/2000/svg">
            <use xlink:href="#svg-icon-help-button"></use>
          </svg></a>
      </div>
      <ResizeHandle @resize="onResize" @resize-end="onResizeEnd"></ResizeHandle>
    </div>
  </div>
</template>


<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { Ref } from 'rete-vue-plugin'
import ResizeHandle from '../components/ResizeHandle.vue'
import OnshapeControl from './OnshapeControl.vue'
import TranslateLock from '../components/TranslateLock.vue'
import OnshapeInput from './OnshapeInput.vue'
import OnshapeInputMap from './OnshapeInputMap.vue'
import { OnshapeOutput } from '../rete/inputoutput/onshapeoutput.js'
import { OnshapeNode } from '../rete/nodes/onshapenode'
import { OnshapeInput as OnshapeInputType } from '../rete/inputoutput/onshapeinput.js'
import { OnshapeInput as OnshapeInputClass } from '../rete/inputoutput/onshapeinput.js';
import {
  COLLAPSED_SOCKET_MAX_ROWS,
  collectCollapsedOutputSockets,
  collectCollapsedSockets,
  collapsedSocketRows,
  commitTitleEdit,
  nextCollapsed,
  shouldStartTitleEdit,
  titleEditActionForKey,
} from './nodechrome-helpers.js';

export default defineComponent({
  props: {
    data: {
      required: true,
      type: Object as PropType<OnshapeNode>
    },
    emit: Function,
    seed: Number,
    // Maximum socket rows in the collapsed grid (3 by default); overflow
    // continues in new columns instead of making the card taller.
    collapsedRows: {
      type: Number,
      default: COLLAPSED_SOCKET_MAX_ROWS,
    },
  },
  data() {
    return {
      title: this.data.getTitle(),
      titleEditFocus: false,
      // Draft while renaming (#72): the committed value only reaches `title`
      // (and the `title` watcher -> `data.setTitle`) on Enter/blur, and
      // Escape can still restore the original untouched.
      titleDraft: '',
      titleEditOriginal: '',
      titleEditCancelled: false,
      titlePressX: null as number | null,
      titlePressY: null as number | null,
      // Collapsed state (#72): kept in memory on the node object so it
      // survives component remounts, but it is NOT serialized to disk.
      collapsed: ((this.data as any).collapsed ?? false) as boolean,

      width: this.data.width,
      height: this.data.height,

      hiddenParameters: this.data.hiddenParameters,

      updateComponent: 0
    }
  },
  methods: {
    visibleInputs(): Array<[string, OnshapeInputType<any>]> {
      // Method, not computed: graph nodes are raw model objects (markRaw),
      // so socket mutations are not reactive. `area.update('node')` rerenders
      // the component, and a method re-reads the live input map. A computed
      // here cached the initially mounted sockets and hid newly added
      // boundary ports until the group was exited and re-entered.
      return this.inputs().filter(([key, input]) => {
        // Arguments (context, id) are always visible
        const inputType = (input as any).type;
        if (inputType === "argument") {
          return true;
        }
        // Map inputs (definition) are always visible
        if (inputType === "map") {
          return true;
        }
        // Regular parameters check against top-level hiddenParameters
        return this.hiddenParameters[key] !== true;
      });
    },
    collapsedInputs(): any[] {
      return collectCollapsedSockets(this.visibleInputs().map(([key, input]: any) => ({ key, input })) as any, this.data.id);
    },
    collapsedOutputs(): any[] {
      return collectCollapsedOutputSockets(Object.fromEntries(this.outputs()) as any, this.data.id);
    },
    /**
     * Grid template for one collapsed socket group: only as many rows as the
     * sockets need (capped at the configured max, default 3). Inline because
     * `repeat()` needs an integer and the two groups usually differ.
     */
    collapsedRowsStyle(count: number): Record<string, string> {
      return { '--collapsed-socket-rows': String(collapsedSocketRows(count, this.collapsedRows)) };
    },
    /**
     * Minimum card width. Collapsed cards keep their expanded width as the
     * floor (so the title does not suddenly truncate) but may grow past it
     * when the socket grid needs more columns.
     */
    collapsedMinWidth(): number | null {
      const candidate = this.collapsed && Number.isFinite(this.width) ? this.width : this.data.minWidth;
      return Number.isFinite(candidate) ? candidate : null;
    },
    /** Explain an empty Start/End card instead of leaving a blank body. */
    boundaryEmptyText(): string | null {
      const type = (this.data as any).type;
      if (type === "group-input" && Object.keys(this.data.outputs).length === 0) {
        return "No inputs exposed — use Group inputs and outputs.";
      }
      if (type === "group-output" && Object.keys(this.data.inputs).length === 0) {
        return "No outputs exposed — use Group inputs and outputs.";
      }
      if (
        type === "group-instance" &&
        Object.keys(this.data.inputs).length === 0 &&
        Object.keys(this.data.outputs).length === 0
      ) {
        return "No inputs or outputs exposed — open the group to configure.";
      }
      return null;
    },
    proxyEmit(...args: any[]) {
      this.emit?.(...args);
    },
    inputs(): Array<[string, OnshapeInputType<any>]> {
      return Object.entries(this.data.inputs);
    },
    controls() {
      return Object.entries(this.data.controls);
    },
    nothing() {
      console.log(this.data);
    },
    outputs(): Array<[string, OnshapeOutput]> {
      return Object.entries(this.data.outputs);
    },
    controlValueChange(input: OnshapeInputClass<any>, value: any) {
      if (input.type !== "map") {
        input.control.setValue(value);
      }
      // this.data.updateParameter(control.type, value);
    },
    // updateTitle(e: MouseEvent) {
    //   this.emit('update:title', e?.target?.value)
    // },
    focusTitleEdit() {
      this.titleEditOriginal = this.title;
      this.titleDraft = this.title;
      this.titleEditCancelled = false;
      this.$data.titleEditFocus = true;
      this.$nextTick(() => {
        const titleEditRef = this.$refs.titleEditElem as HTMLInputElement;
        titleEditRef?.focus();
        titleEditRef?.select();
      });
    },
    onTitlePress(event: PointerEvent) {
      // Remember where the press landed: the click handler only starts an
      // edit if the pointer barely moved, so dragging the node by its title
      // still moves it instead of opening the rename box (#72).
      this.titlePressX = event.clientX;
      this.titlePressY = event.clientY;
    },
    onTitleClick(event: MouseEvent) {
      if (!shouldStartTitleEdit(this.titlePressX, this.titlePressY, event.clientX, event.clientY)) {
        return;
      }
      this.focusTitleEdit();
    },
    onTitleEditKeydown(event: KeyboardEvent) {
      const action = titleEditActionForKey(event.key);
      if (action === 'cancel') {
        // Cancel discards the draft; the blur that follows is guarded by
        // `titleEditCancelled` so it cannot commit the restored value.
        this.titleDraft = this.titleEditOriginal;
        this.titleEditCancelled = true;
        this.$data.titleEditFocus = false;
      } else if (action === 'commit') {
        (event.target as HTMLInputElement).blur();
      }
    },
    onTitleEditBlur() {
      // Blur commits the draft through the existing `title` watcher
      // (`data.setTitle`); a cancelled edit exits without touching it.
      if (!this.titleEditCancelled) {
        this.title = commitTitleEdit(this.titleEditOriginal, this.titleDraft);
      }
      this.titleEditCancelled = false;
      this.$data.titleEditFocus = false;
    },
    toggleCollapsed() {
      this.collapsed = nextCollapsed(this.collapsed);
      // In-memory only: the node object outlives this component, but the
      // graph serializer does not persist `collapsed` (#72).
      (this.data as any).collapsed = this.collapsed;
      // The body height changed; let rete re-measure the node.
      this.$nextTick(() => this.data.update());
    },
    onResize(dx: number) {
      const previousWidth = this.data.width;
      const zoom = this.data.area?.area?.transform?.k ?? 1;
      this.width += dx / zoom;
      this.data.width = Math.min(Math.max(this.data.minWidth, this.width), this.data.maxWidth); // sync node width
      if (previousWidth !== this.data.width) {
        this.data.update();
      }
    },
    onResizeEnd() {
      // sync with node data
      this.width = this.data.width;
    },
    isMapInput(input: OnshapeInputType<any>): boolean {
      return (input as any).type === "map";
    }
  },
  watch: {
    title(newTitle) {
      this.data.setTitle(newTitle);
    }
  },
  mounted() {
    this.data.updateComponent = () => {
      this.updateComponent++;
    }
  },
  components: {
    Ref,
    ResizeHandle,
    OnshapeControl,
    TranslateLock,
    OnshapeInput,
    OnshapeInputMap
  }
});
</script>

<style lang="scss" scoped>
@use "sass:math";
@use "./vars" as *;

// Paint order is DOM order, owned by the canvas (#27, DR-007): nodes are
// reordered by `NodeOrderKeeper`, so there is no z-index here to fight it.
// `z-index: -1` used to paint every node behind the canvas background.
//
// Card per STYLE_GUIDE.md: white, 1px hairline, 4–6px radius, flat (no shadow
// heavier than 0 1px 3px rgba(0,0,0,.08)). The vendored woolsthorpe.css gives
// `.ns-dialog-frame` a 0 5px 10px drop shadow; the rules below replace it.
//
// Node type/palette (#35), deliberate for a populated graph at 100% zoom —
// NOT the rejected #32 page tokens (12px/600 title + 11px muted labels/values)
// and NOT the accidental pre-#32 defaults (17px/15px pure black):
//  - Title 14px/600 in warm ink: one step above values, weight + size carry
//    the header; 17px made every node shout over its neighbours when many
//    nodes are on screen, 12px made the header indistinguishable from rows.
//  - Labels 12px/400 in the SAME warm ink at 60% opacity; values 13px/400
//    in warm ink at 100% (mono 12px for literal input text). Hierarchy is
//    opacity + size/mono, never a second grey hue, so values stay legible
//    (11px at secondary opacity was the rejected failure mode) while labels
//    recede. Warm ink is #1a1a1a, not pure black, so dense rows are quieter.
//  - Palette follows the amended guide (d6fb185): hairline #d9d9d4,
//    hover-sharpened hairline #8c8c86, steel-blue #2f5f8f for selection/focus
//    only. The slate/blue page tokens in common.css are not used here.
// Tokens are node-local aliases (under `.node`) of the single palette in
// src/app/common.css (#33); no hex lives outside common.css.
.node {
  --node-ink: var(--ink);
  --node-hairline: var(--hairline);
  --node-hairline-strong: var(--hairline-strong);
  --node-accent: var(--accent-steel);
  --node-font-sans: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --node-font-mono: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  --node-title-size: 14px;
  --node-title-weight: 700;
  --node-title-line-height: 1.2;
  --node-label-size: 12px;
  --node-label-weight: 400;
  --node-label-line-height: 1.35;
  --node-label-opacity: 0.6;
  --node-value-size: 13px;
  --node-value-weight: 400;
  --node-value-line-height: 1.35;
  --node-value-mono-size: 12px;

  .ns-dialog-frame {
    background: var(--surface);
    border: 1px solid var(--node-hairline);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-1);
  }

  &:hover .ns-dialog-frame {
    border-color: var(--node-hairline-strong);
  }

  &.selected .ns-dialog-frame {
    border-color: var(--node-accent);
    // Selection ring as an outer box-shadow (issue #37): painted BEHIND the
    // element, unlike a border or outline, so it can never cover the port
    // rectangles that straddle the frame edge. Combined with the lifted
    // .socket-container (OnshapeSocket.vue, z-index within this node's own
    // stacking context), ports always paint above the selection outline at
    // every edge. No per-node z-index: NodeOrderKeeper owns paint order.
    box-shadow: 0 0 0 1px var(--node-accent), var(--shadow-1);
  }

  // Header strip: structural hairline only; header type is set below.
  .ns-dialog-header {
    background: var(--surface);
    border-bottom: 1px solid var(--node-hairline);
    border-radius: var(--radius-card) var(--radius-card) 0 0;
  }
}

.output {
  text-align: right;
  font-size: 0px;
  display: flex;
  flex-direction: row-reverse;

  .os-param-wrapper {
    flex-direction: inherit;
  }
}

@mixin io-socket {
  height: auto;
  text-align: right;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.output-socket {
  @include io-socket();
  margin-right: - round($socket-overflow, 1px);
}

// Node title (#35): 14px/700 true bold (real Inter Bold face, common.css)
// warm ink at 100% opacity, 1.2 line-height.
// `!important` retained only to beat the vendored woolsthorpe.css title size.
.ns-dialog-title,
.os-dialog-header-rename-textbox {
  color: var(--node-ink) !important;
  font-family: var(--node-font-sans);
  font-size: var(--node-title-size) !important;
  font-weight: var(--node-title-weight) !important;
  line-height: var(--node-title-line-height) !important;
  opacity: 1;
  outline: none;
}

// Quiet hairline focus (STYLE_GUIDE: no saturated blue select box). The
// vendored rule paints `border: 1px solid --os-feature-dialog-…` on focus;
// replace it with a 1px node hairline and no outline at all.
.os-dialog-header-rename-textbox:focus {
  outline: none !important;
  border: 1px solid var(--node-hairline-strong) !important;
  outline-offset: 0;
  box-shadow: none !important;
}

// Selecting the title to replace it must not flash the browser's saturated
// blue selection box either; use the node's own quiet hairline/ink.
.os-dialog-header-rename-textbox::selection {
  background: var(--node-hairline-strong);
  color: var(--node-ink);
}

.os-param-wrapper {
  flex-wrap: nowrap;
  overflow: visible;

  // Parameter labels (#35): 12px/400 warm ink at 60% opacity — secondary by
  // opacity, not by a second grey hue.
  .output-title,
  .os-param-label {
    vertical-align: middle;
    display: inline-block;
    margin: $socket-margin;
    user-select: none;
    color: var(--node-ink);
    opacity: var(--node-label-opacity);
    font-family: var(--node-font-sans);
    font-weight: var(--node-label-weight);
    line-height: var(--node-label-line-height);
    padding-top: 0px;
    font-size: var(--node-label-size);
    overflow: visible;
    align-self: center;
  }
}

// Values inside child components (OnshapeInput / controls) still carry their
// own scoped 15px/black label rules; `:deep` from this node is the single
// place the #35 scale is applied, without editing those files.
// Labels in children get the same 12px/400/60%-opacity treatment.
.node {
  :deep(.input-title),
  :deep(.os-param-label) {
    color: var(--node-ink) !important;
    opacity: var(--node-label-opacity) !important;
    font-family: var(--node-font-sans) !important;
    font-size: var(--node-label-size) !important;
    font-weight: var(--node-label-weight) !important;
    line-height: var(--node-label-line-height) !important;
  }

  // Literal values: text/number inputs and textareas are mono 12px/400 at
  // 100% opacity (guide: monospace 12px for literal values) — one step
  // below the 13px sans value size, but legible and digit-aligned.
  :deep(input[type='text']:not(.node-title-editor)),
  :deep(input[type='number']:not(.node-title-editor)),
  :deep(input:not([type]):not(.node-title-editor)),
  :deep(textarea) {
    color: var(--node-ink) !important;
    opacity: 1;
    font-family: var(--node-font-mono) !important;
    font-size: var(--node-value-mono-size) !important;
    font-weight: var(--node-value-weight) !important;
    line-height: var(--node-value-line-height) !important;
  }

  // Quantity value inputs: 13px/400 sans, like every other node value
  // (STYLE_GUIDE). Specificity is raised to tie the literal-mono rule above
  // (input[type=...] + :not(...) = 0,2,1) and declared AFTER it, so it wins
  // for `os-param-number` inputs and anything inside the quantity holder.
  // Without this, quantity fields rendered in Courier — wrong for a value
  // control (measured: ui-monospace 12px in headless Chrome).
  :deep(input[type='text'].os-param-number),
  :deep(input[type='number'].os-param-number),
  :deep(.quantity-autocomplete-holder input.os-param-number) {
    font-family: var(--node-font-sans) !important;
    font-size: var(--node-value-size) !important;
  }

  // Non-literal values (enum/select surfaces): 13px/400 sans at 100%.
  :deep(select),
  :deep(.os-select-container),
  :deep(.select-input) {
    color: var(--node-ink) !important;
    opacity: 1;
    font-family: var(--node-font-sans) !important;
    font-size: var(--node-value-size) !important;
    font-weight: var(--node-value-weight) !important;
    line-height: var(--node-value-line-height) !important;
  }
}

.control {
  padding: $socket-margin math.div($socket-size, 2) + $socket-margin;
}

.dialog-content {
  width: 100%;
}

// Generic-definition warning: standard-library statements whose definition
// map schema is unknown carry this banner instead of looking complete.
.generic-definition-warning {
  margin: 0;
  padding: 6px 8px;
  border-bottom: 1px solid var(--hairline);
  color: var(--warning);
  font-family: var(--node-font-sans);
  font-size: var(--font-size-label);
  line-height: 1.35;
}

.boundary-empty-hint {
  margin: 0;
  padding: 8px;
  color: var(--ink-soft);
  font-family: var(--node-font-sans);
  font-size: var(--font-size-label);
  line-height: 1.35;
}

.dialog-help-container {
  position: relative;
  display: flex;
  flex-direction: row-reverse;
}

.feature-dialog-main {
  position: relative;
  box-sizing: border-box;
  // Node-local stacking context (issue #37): child z-indexes (ports) are
  // scoped to this node and cannot fight NodeOrderKeeper's paint order.
  isolation: isolate;
}

.feature-dialog {
  left: 0px;
  top: 0px;
}

// A collapsed node is content-sized in BOTH axes: the inline expanded height
// and width are skipped, and the max-width cap is lifted, so the socket grid
// can overflow into extra columns without clipping. Re-expanding removes this
// class and restores the stored expanded size.
.node.collapsed {
  height: auto !important;
  width: max-content !important;
  max-width: none !important;
  min-height: 0;
}

// Header chrome (#72): the title is centred between two small header buttons.
// The title box and the rename input are absolutely centred inside the
// container so the side buttons hold the edges and the text stays in the
// middle; the container itself is still the drag surface, so drag/resize
// behaves exactly as before.
.node-title-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.node-title {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  max-width: calc(100% - 64px);
  text-align: center;
  cursor: text;
}

.node-title-editor {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(200px, calc(100% - 64px));
  text-align: center;
  // Same typography as the visible (centered) title, not the mono literal
  // style and not the vendored 13px textbox size.
  font-family: var(--node-font-sans) !important;
  font-size: var(--node-title-size) !important;
  font-weight: var(--node-title-weight) !important;
  line-height: var(--node-title-line-height) !important;
  color: var(--node-ink) !important;
  border: 1px solid transparent;
}

.node-title-editor:focus {
  outline: none !important;
  border: 1px solid var(--node-hairline-strong) !important;
  box-shadow: none !important;
  background: var(--surface);
}

.node-header-button {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-card);
  background: transparent;
  color: var(--node-ink);
  cursor: pointer;
}

.node-header-button:focus-visible {
  outline: 1px solid var(--node-accent);
  outline-offset: 1px;
}

.node-collapse-icon {
  width: 14px;
  height: 14px;
  color: var(--text-secondary);
  flex: none;
  transition: transform 0.15s ease;

  &.expanded {
    transform: rotate(0deg);
  }

  &:not(.expanded) {
    transform: rotate(-90deg);
  }
}

// Rename affordance: hidden until the header is hovered or has focus, so it
// is easy to reach but never flickers while moving the pointer between the
// title and the button (#72 used a JS hover flag that hid the button
// mid-move). The button stays in the layout, so it remains natively
// focusable.
.node-title-edit-toggle {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.node-title-container:hover .node-title-edit-toggle,
.node-title-container:focus-within .node-title-edit-toggle,
.node-title-edit-toggle:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

// Compact socket grid while collapsed: sockets stack top-to-bottom in up to
// three rows and then overflow sideways — inputs into columns to the RIGHT of
// their block, outputs into columns to the LEFT of theirs — so a 7-socket
// Chamfer stays short instead of turning into a tall half-expanded column.
// The two blocks sit at opposite card edges (space-between) and each column
// starts at its top row. Every Ref stays a live rete socket.
.collapsed-socket-strip {
  --collapsed-socket-rows: 3;
  --collapsed-socket-row-height: 14px;
  --collapsed-socket-column-width: 12px;
  --collapsed-socket-row-gap: 2px;
  --collapsed-socket-column-gap: 4px;
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 2px 10px;
  min-height: 0;
  padding: 2px 6px 4px;
}

.collapsed-socket-group {
  display: grid;
  grid-template-rows: repeat(var(--collapsed-socket-rows), var(--collapsed-socket-row-height));
  grid-auto-flow: column;
  grid-auto-columns: var(--collapsed-socket-column-width);
  row-gap: var(--collapsed-socket-row-gap);
  column-gap: var(--collapsed-socket-column-gap);
  align-items: center;
  justify-items: center;
  min-width: 0;
}

.collapsed-socket-inputs {
  // Column flow fills top-to-bottom, then adds columns to the right.
  margin-right: auto;
}

.collapsed-socket-outputs {
  // direction: rtl makes the inline axis run right-to-left, so column flow
  // fills top-to-bottom and adds overflow columns to the LEFT of the block.
  direction: rtl;
  margin-left: auto;
}

.collapsed-socket {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  min-width: 8px;
  // Fixed (not min-) height: the port box inside OnshapeSocket is 24px
  // tall, so a min-height here never compacted the strip — each collapsed
  // socket measured 24px and a 7-socket Chamfer collapsed to ~229px, only
  // 38px shorter than its 267px expanded frame (and taller than small
  // expanded cards). Pin the row and its port box to the intended 14px.
  height: 14px;
  min-height: 0;
}

// The port box and its snap target are 24px / 40x30px in the expanded
// rows; in the strip they must shrink with the row or they re-inflate it
// (and the 30px snap targets of stacked sockets would overlap each
// other). The colour/scale from OnshapeSocket is unchanged, so the dot
// stays fully visible and unclipped inside its 14px row. The target is
// 14px wide in a 12px column with a 4px gap, so neighbouring columns never
// overlap and every collapsed socket stays individually connectable.
.collapsed-socket :deep(.socket-container) {
  width: 12px;
  height: 14px;
}

.collapsed-socket :deep(.socket) {
  width: 12px;
  height: 14px;
}

.collapsed-socket :deep(.snap-target) {
  width: 14px;
  height: 14px;
  top: 0;
  left: -1px;
}
</style>
