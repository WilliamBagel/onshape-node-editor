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
    </div>
  </div>
</template>

<script lang="ts">
import { PropType } from 'vue';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
import { reteAppInstance } from '../../rete/editorbase';
import { TransientSelection, TransientSelectionType } from '../../onshape-utils/featurescripttypes';
import { App } from '../../app';

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
    }
  },
  methods: {
    // canDisplayItem(item: any): boolean {
    //   return item != null && item.getIsHidden?.() !== true;
    // },
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
    onParameterFocused(event: FocusEvent) {
      this.isFocused = true;
      this.app?.clientMessaging?.requestSelectionHighlight([]);
      this.app?.clientMessaging?.requestSelection([''], (data: TransientSelection[]) => {
        this.value = data;
        this.$emit('value-change', this.value);
        return false;
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
@use "sass:math";
// @use "./vars" as *;

.os-param-query-list {
  box-sizing: border-box;
}
</style>