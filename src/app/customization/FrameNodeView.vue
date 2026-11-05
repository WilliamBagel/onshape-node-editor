<template>
  <div
    class="frame-node node"
    :class="{ selected: data.selected }"
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
      </span>
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

    return { titleEditFocus, titleEditElem, endTitleEdit };
  },
});
</script>

<style scoped>
.frame-node {
  background: var(--surface);
  border: 1px solid var(--border-hairline);
  border-radius: 5px;
  box-sizing: border-box;
  overflow: hidden;
  /* Paint layer (frame-layout.ts): below the connection SVGs (-5) and
     above the canvas background (-10), so edges crossing the frame stay
     visible. The editor also sets this on the node wrapper element,
     which is the positioned element in the area holder. */
  position: relative;
  z-index: -6;
}

.frame-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-subtle);
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
  color: var(--text-primary);
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frame-title-edit {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  padding: 1px 4px;
}

.frame-title-edit:focus {
  outline: 1px solid var(--accent);
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
  border: 1px solid var(--border-hairline);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.frame-node.selected {
  border-color: var(--accent);
}
</style>
