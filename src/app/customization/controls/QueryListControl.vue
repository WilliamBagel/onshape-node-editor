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
                <li v-for="(queryItem, index) in visibleItems" :key="index" class="os-param-selection-list-entry"
                  @mouseover="queryItem.onMouseOver($event)" @mouseleave="queryItem.onMouseLeave($event)">
                  <span class="os-selection-item-line">
                    <span class="os-param-query-list-entry-text"
                      :class="{ 'ns-list-item-error': queryItem.getHasError() }" @mousedown="queryItem.onClick($event)">
                      {{ queryItem.getLabel ? queryItem.getLabel() : queryItem.label }}
                    </span>
                  </span>
                  <span class="os-param-selection-list-entry-delete" @click.stop="deleteItem(queryItem)">×</span>
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
import { inject, PropType, shallowRef } from 'vue';
import { OnshapeInputControl } from '../../rete/controls/onshapeinputcontrol';
import { QueryListType } from '../../onshape-utils/featurescripttypes';
import { App } from '../../app';

type QueryListControl = OnshapeInputControl<QueryListType>;

export default {
  emits: ['value-change'],
  props: {
    control: {
      required: true,
      type: Object as PropType<QueryListControl>
    }
  },
  setup() {
    const app = inject<App | null>('app', null) 
    return {
      app,
      selections: shallowRef(app?.clientMessaging?.selections)
    };
  },
  data() {
    return {
      queryListItems: this.control.getCurrentValue() ?? [],
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
    visibleItems(): any[] {
      return this.queryListItems.queries.filter((item) => this.canDisplayItem(item));
    },
    isEmpty(): boolean {
      return this.queryListItems.queries.length === 0;
    }
  },
  methods: {
    canDisplayItem(item: any): boolean {
      return item != null && item.getIsHidden?.() !== true;
    },
    deleteItem(queryItem: any) {
      const items = this.queryListItems.queries;
      const index = items.indexOf(queryItem);
      if (index !== -1) {
        items.splice(index, 1);
      }
      this.$emit('value-change', this.queryListItems);
    },
    onKeyDown(event: KeyboardEvent) {
      // Keyboard navigation can be extended here
    },
    onParameterFocused(event: FocusEvent) {
      this.isFocused = true;
      this.app?.clientMessaging.requestSelectionHighlight([]);
      this.app?.clientMessaging.requestSelection([''], (data: any[]) => {
        this.selections = data;
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