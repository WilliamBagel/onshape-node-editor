<template>
  <div class="">
    <div class="os-param-wrapper os-param-query-list-container os-param-container">
      <div class="os-row os-grow">
        <div class="os-param-query-list os-param-selection-list os-grow os-param-query-list-resize" :class="{
          'os-param-query-list-focus': isFocused,
          'os-param-query-list-invalid': hasError
        }" tabindex="0" @keydown="onKeyDown" @focus="onParameterFocused" @blur="onParameterFocusLost"
          @click="focusOnQlvIfAble">
          <div class="slimScrollDiv" style="position: relative; overflow: hidden; width: auto;">
            <div class="os-param-query-list-scroll-box"
              style="overflow: hidden; width: calc(100% + 20px); padding-right: 20px; height: auto; min-height: auto;">
              <div class="os-param-query-list-header">
                <label class="os-param-query-list-label os-grow"
                  v-bind:class="{ 'os-param-query-list-small-label': !isEmpty }">
                  {{ label }}
                </label>
              </div>
              <ul class="os-param-list-container">
                <li v-for="(selection, index) in visibleItems" :key="index" class="os-param-selection-list-entry">
                  <span class="os-selection-item-line">
                    <span class="os-param-query-list-entry-text"
                      :class="{ 'ns-list-item-error': false }">
                      {{selection.entityType}} {{ selection.selectionId }} {{ selection.selectionType }}
                    </span>
                  </span>
                  <span class="os-param-selection-list-entry-delete" @click.stop="deleteItem(selection)">×</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <!-- Per STYLE_GUIDE.md, a per-node problem is a small corner badge, never
           a warning drawn over the canvas. The detail is in the log / #30 tab. -->
      <span v-if="hasError" class="query-list-badge" role="img" aria-label="Selection problem"></span>
    </div>
  </div>
</template>

<script lang="ts">
import { PropType } from 'vue';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
import { reteAppInstance } from '../../rete/editorbase';
import { TransientSelection, TransientSelectionType } from '../../onshape-utils/featurescripttypes';
import { App } from '../../app';
import { inject } from 'vue';

// The control will only ever show selections because it is a control
// The conversion from selections to a query will happen elsewhere
type QueryListControl = OnshapeInputControl<TransientSelectionType>;

export default {
  emits: ['value-change'],
  props: {
    control: {
      required: true,
      type: Object as PropType<QueryListControl>
    }
  },
  data() {
    return {
      value: this.control.getCurrentValue() ?? [],
      isFocused: false,
    };
  },
  computed: {
    label(): string {
      return this.control.label;
    },
    hasError(): boolean {
      return this.control.getHasError?.() ?? false;
    },
    visibleItems(): TransientSelection[] {
      // return queries if we have any
      console.log(this.value);
      return (this.value as TransientSelection[]);
    },
    isEmpty(): boolean {
      return this.value.length === 0;
    },
    app(): App {
      return reteAppInstance;
    },
    controlId(): string {
      // Use control's label + a unique suffix for warning deduplication
      return `querylist-${this.control.label}-${this.control.id ?? 'unknown'}`;
    }
  },
  methods: {
    deleteItem(selection: any) {
      const selections = this.value;
      const index = selections.indexOf(selection);
      if (index !== -1) {
        selections.splice(index, 1);
      }
      this.$emit('value-change', this.value);
    },
    onKeyDown(event: KeyboardEvent) {
      // Keyboard navigation can be extended here
    },
    reportSelectionProblem(message: string) {
      // #4: failures go through the log store, not the console. `reportMessage`
      // records an entry in `App.log` (BuildLogStore) and shows a bubble.
      // Per STYLE_GUIDE.md, no floating warning is added to the canvas here.
      const app: any = this.app;
      if (typeof app?.reportMessage === 'function') {
        app.reportMessage(message, 'warning', 'editor');
      } else if (app?.log) {
        app.log.add({ severity: 'warning', source: 'editor', message });
      }
    },
    onParameterFocused(event: FocusEvent) {
      this.isFocused = true;
      this.app?.clientMessaging?.requestSelectionHighlight([]);
      this.app?.clientMessaging?.requestSelection([''], (data: TransientSelection[]) => {
        // Issue #29: focusing must never clear an existing value. An empty
        // or missing SELECTION is not a user clear action (deleting an item
        // with × is), so keep the current value and report the discard
        // through the log store instead of silently overwriting it.
        if (!Array.isArray(data) || data.length === 0) {
          if (Array.isArray(this.value) && this.value.length > 0) {
            this.reportSelectionProblem(
              `Selection for "${this.label}" returned no geometry; keeping the existing value.`
            );
          }
          return false;
        }
        this.value = data;
        this.$emit('value-change', this.value);
        return false;
      }, undefined, this.controlId, (reason: string) => {
        // Failed/aborted request: keep the existing value (the success
        // callback is not invoked) and report through the log store.
        this.reportSelectionProblem(`Selection for "${this.label}" failed: ${reason}`);
      });
    },
    onParameterFocusLost(event: FocusEvent) {
      this.isFocused = false;
    },
    focusOnQlvIfAble() {
      (this.$el as HTMLElement).querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    }
  }
};
</script>

<style lang="scss" scoped>
/* Selection list per STYLE_GUIDE.md: hairline box, 11px type, monospace for
   the literal selection ids, focus/error as a border colour. Tokens live in
   src/app/common.css; the vendored woolsthorpe.css fills are overridden here. */
.os-param-query-list {
  box-sizing: border-box;
}

.os-param-query-list-container {
  position: relative;
}

.os-param-selection-list {
  position: relative;
  border: 1px solid var(--border-hairline);
  border-radius: var(--radius-control);
  background: var(--surface);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--font-size-field);
  line-height: 1.45;
}

.os-param-selection-list.os-param-query-list-focus {
  border-color: var(--accent);
}

/* Error state: a hairline, not a saturated fill or a dashed warning box. */
.os-param-selection-list.os-param-query-list-invalid {
  border-color: var(--danger);
  background: var(--surface);
  color: var(--text-primary);
}

.os-param-query-list-label {
  color: var(--text-secondary);
  font-size: var(--font-size-field);
}

.os-param-selection-list-entry {
  font-size: var(--font-size-field);
}

.os-param-query-list-entry-text {
  font-family: var(--font-mono);
  font-size: var(--font-size-field);
}

.os-param-selection-list-entry-delete {
  color: var(--text-secondary);
  cursor: pointer;
}

.os-param-selection-list-entry-delete:hover {
  color: var(--danger);
}

/* Small corner badge: the only problem marker that may sit on the canvas. */
.query-list-badge {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--danger);
  pointer-events: none;
}
</style>