<template>
  <div
    class="frame-node node"
    :class="{ selected: data.selected, collapsed: data.collapsed }"
    :style="{
      width: Number.isFinite(width) ? `${width}px` : '',
      height: Number.isFinite(height) ? `${height}px` : '',
    }"
    data-testid="frame-node"
  >
    <div class="frame-header">
      <span class="frame-accent" :style="{ backgroundColor: data.color }"></span>
      <span
        class="frame-title"
        v-show="!titleEditFocus"
        style="user-select: none;"
        @dblclick="titleEditFocus = true"
        >{{ data.label }}</span
      >
      <input
        maxlength="256"
        class="frame-title-edit"
        ref="titleEditElem"
        v-model="data.label"
        v-show="titleEditFocus"
        @blur="endTitleEdit"
        @keydown.enter="endTitleEdit"
        @pointerdown.stop
      />
      <span class="frame-actions">
        <input
          type="color"
          class="frame-color"
          v-model="data.color"
          title="Frame colour"
          @change="data.update()"
          @pointerdown.stop
        />
        <button
          type="button"
          class="frame-toggle"
          :title="data.collapsed ? 'Expand frame' : 'Collapse frame'"
          @click="toggleCollapse"
          @pointerdown.stop
        >
          {{ data.collapsed ? "▸" : "▾" }}
        </button>
      </span>
    </div>
    <div class="frame-body" v-if="data.collapsed">
      <span class="frame-meta">collapsed · contents hidden</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, type PropType } from "vue";
import type { FrameNode } from "../rete/nodes/framenode";

export default defineComponent({
  name: "FrameNodeView",
  props: {
    data: { type: Object as PropType<FrameNode>, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  setup(props) {
    const titleEditFocus = ref(false);
    const titleEditElem = ref<HTMLInputElement | null>(null);

    function endTitleEdit() {
      titleEditFocus.value = false;
      props.data.setTitle(props.data.label);
      props.data.update();
    }

    function toggleCollapse() {
      // Hiding/showing descendants needs the area, which the view does not
      // own; editorbase assigns `onCollapsedChanged` for exactly this.
      props.data.collapsed = !props.data.collapsed;
      props.data.update();
      props.data.onCollapsedChanged?.(props.data.collapsed);
    }

    return { titleEditFocus, titleEditElem, endTitleEdit, toggleCollapse };
  },
});
</script>

<style scoped>
.frame-node {
  background: #ffffff;
  border: 1px solid #d9d9d4;
  border-radius: 5px;
  box-sizing: border-box;
  overflow: hidden;
}

.frame-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid #e8e8e3;
}

.frame-accent {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex: 0 0 auto;
}

.frame-title {
  font-size: 14px;
  font-weight: 600;
  color: #1f1f1c;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frame-title-edit {
  font-size: 14px;
  font-weight: 600;
  color: #1f1f1c;
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid #b6b6b0;
  border-radius: 4px;
  padding: 1px 4px;
}

.frame-title-edit:focus {
  outline: 1px solid #2f5f8f;
}

.frame-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.frame-color {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid #d9d9d4;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.frame-toggle {
  font-size: 12px;
  line-height: 1;
  color: #4a4a45;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 5px;
  cursor: pointer;
}

.frame-toggle:hover {
  border-color: #d9d9d4;
  color: #2f5f8f;
}

.frame-body {
  padding: 6px 8px;
}

.frame-meta {
  font-size: 11px;
  color: #6b6b66;
}

.frame-node.selected {
  border-color: #2f5f8f;
}
</style>
