<template>
  <div
    class="math-node node"
    :class="{ selected: data.selected, invalid: !data.isValid }"
    data-testid="math-expression-node"
    :style="{
      width: Number.isFinite(width) ? `${width}px` : '',
      height: Number.isFinite(height) ? `${height}px` : '',
    }"
  >
    <div class="math-header">
      <span class="math-title" :title="data.source">{{ data.getTitle() }}</span>
      <button
        type="button"
        class="math-toggle"
        :title="data.collapsed ? 'Expand math expression' : 'Collapse math expression'"
        @click="toggleCollapse"
        @pointerdown.stop
      >
        {{ data.collapsed ? "▸" : "▾" }}
      </button>
    </div>

    <div class="math-body" v-if="!data.collapsed">
      <!-- Monospace text source with light syntax highlighting: the
           highlighted <pre> sits behind a transparent-text <textarea>,
           so the caret and selection stay native. Not WYSIWYG. -->
      <div class="math-source-wrap">
        <pre class="math-highlight" aria-hidden="true"><code v-html="highlightedSource"></code></pre>
        <textarea
          class="math-source"
          rows="2"
          spellcheck="false"
          :value="data.source"
          :aria-label="`Math expression source. ${data.errorMessage ?? ''}`"
          @input="onInput"
          @blur="flushRender"
          @pointerdown.stop
        ></textarea>
      </div>

      <div
        class="math-error"
        v-if="!data.isValid"
        :title="data.errorMessage"
        role="alert"
      >
        {{ data.errorMessage }}
      </div>

      <!-- Typeset preview: MathML plus the plain source as aria-label. -->
      <div
        class="math-preview"
        v-if="rendered"
        role="img"
        :aria-label="data.source"
        v-html="rendered.html"
      ></div>

      <div class="math-sockets">
        <div
          class="math-socket-row"
          v-for="[key, input] in inputs()"
          :key="key"
        >
          <Ref
            class="math-socket"
            :emit="emit"
            :data="{ type: 'socket', side: 'input', key, btType: input.socket?.name ?? key, nodeId: data.id, payload: input }"
          />
          <span class="math-socket-label">{{ key }}</span>
        </div>
        <div class="math-socket-row" v-for="[key, output] in outputs()" :key="key">
          <span class="math-socket-label">{{ key }}</span>
          <Ref
            class="math-socket"
            :emit="emit"
            :data="{ type: 'socket', side: 'output', key, btType: output.socket?.name ?? key, nodeId: data.id, payload: output }"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, ref, type PropType } from "vue";
import { Ref } from "rete-vue-plugin";
import type { MathExpressionNode } from "../rete/nodes/mathexpressionnode";
import {
  debounce,
  getMathRenderer,
  type RenderedMath,
} from "../rete/nodes/math-renderer";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Numbers, operators and identifiers get a light tint; the text itself is untouched. */
function highlight(source: string): string {
  const escaped = escapeHtml(source);
  return escaped
    .replace(/(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gi, '<span class="tok-number">$1</span>')
    .replace(/([+\-*/%^~<>=!]+)/g, '<span class="tok-op">$1</span>')
    .replace(/(\b[A-Za-z_][A-Za-z0-9_]*\b)/g, '<span class="tok-ident">$1</span>');
}

export default defineComponent({
  name: "MathExpressionNodeView",
  components: { Ref },
  props: {
    data: { type: Object as PropType<MathExpressionNode>, required: true },
    emit: { type: Function, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  setup(props) {
    const rendered = ref<RenderedMath | null>(null);

    function renderNow() {
      const latex = props.data.getLatex();
      rendered.value = latex != null ? getMathRenderer().render(latex) : null;
    }

    const debouncedRender = debounce(() => renderNow(), 150);

    function onInput(event: Event) {
      const value = (event.target as HTMLTextAreaElement).value;
      props.data.setSource(value);
      props.data.update();
      debouncedRender();
    }

    function toggleCollapse() {
      props.data.setCollapsed(!props.data.collapsed);
      props.data.update();
    }

    const highlightedSource = computed(() => highlight(props.data.source) + "\n");

    renderNow();

    return {
      rendered,
      highlightedSource,
      onInput,
      flushRender: debouncedRender.flush,
      toggleCollapse,
      inputs: () => Object.entries(props.data.inputs),
      outputs: () => Object.entries(props.data.outputs),
    };
  },
});
</script>

<style scoped>
.math-node {
  background: var(--surface);
  border: 1px solid var(--border-hairline);
  border-radius: 5px;
  box-sizing: border-box;
  overflow: hidden;
}

.math-node.selected {
  border-color: var(--accent);
}

.math-node.invalid {
  border-color: var(--danger);
}

.math-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-subtle);
}

.math-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: var(--font-size-label);
}

.math-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
}

.math-body {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.math-source-wrap {
  position: relative;
  font-family: var(--font-mono);
  font-size: var(--font-size-field);
}

.math-highlight,
.math-source {
  font: inherit;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
}

.math-highlight {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 4px 6px;
  pointer-events: none;
  color: var(--text-primary);
}

.math-source {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  background: transparent;
  color: transparent;
  caret-color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 3px;
  resize: vertical;
}

.math-source::selection {
  background: var(--active-tint);
}

.math-node.invalid .math-source-wrap {
  text-decoration: underline wavy var(--danger);
  text-underline-offset: 3px;
}

.math-error {
  color: var(--danger);
  font-size: var(--font-size-meta);
}

.math-preview {
  font-size: var(--font-size-value);
  padding: 2px 4px;
}

.math-sockets {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.math-socket-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.math-socket-label {
  font-size: var(--font-size-meta);
  font-family: var(--font-mono);
}
</style>
