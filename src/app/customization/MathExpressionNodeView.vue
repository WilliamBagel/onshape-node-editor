<template>
  <div
    class="math-node node"
    :class="{ selected: data.selected, invalid: !data.isValid }"
    data-testid="math-expression-node"
    :style="{
      width: Number.isFinite(width) ? `${width}px` : Number.isFinite(data.width) ? `${data.width}px` : '',
      height: Number.isFinite(height) ? `${height}px` : '',
    }"
  >
    <div class="math-header">
      <span class="math-title" data-testid="math-title" :title="data.source">{{ data.getTitle() }}</span>
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

    <!-- The return socket sits at the node's top-right, outside the
         collapsible body, so it stays connectable expanded and collapsed —
         the same top-right position every Onshape node gives its outputs. -->
    <div class="math-output-row" data-testid="math-output-row">
      <span class="math-output-label">return</span>
      <Ref
        :key="'return-' + seed"
        class="math-output-socket"
        data-testid="math-return-socket"
        :emit="emit"
        :data="{ type: 'socket', side: 'output', key: 'return', btType: returnOutput()?.socket?.name ?? 'return', nodeId: data.id, payload: returnOutput() }"
      />
    </div>

    <div class="math-body" v-if="!data.collapsed">
      <!-- One field, two representations (Blender-style): idle shows the
           typeset formula; clicking/focusing swaps in the editable source in
           the same box. Rendered markup is a view only (DR-006). -->
      <div
        class="math-field"
        :class="{ editing, invalid: !data.isValid, empty: isEmpty }"
        data-testid="math-field"
      >
        <button
          v-if="!editing"
          ref="fieldRef"
          type="button"
          class="math-field-idle"
          data-testid="math-field-rendered"
          :aria-label="`Edit math expression: ${source}`"
          title="Click to edit"
          @click="beginEdit"
          @pointerdown.stop
        >
          <span
            v-if="rendered != null"
            class="math-rendered"
            aria-hidden="true"
            v-html="rendered.html"
          ></span>
          <span v-else-if="isEmpty" class="math-placeholder">Enter an expression</span>
          <span v-else class="math-fallback">{{ source }}</span>
          <svg
            class="math-edit-cue"
            data-testid="math-edit-cue"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M12 20h9"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
            <path
              d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <!-- Monospace source with light syntax highlighting: the highlighted
             <pre> sits behind a transparent-text <textarea>, so caret and
             selection stay native while the tinted text stays visible. -->
        <div v-else class="math-source-wrap">
          <pre
            class="math-highlight"
            data-testid="math-field-highlight"
            aria-hidden="true"
          ><code v-html="highlightedSource"></code></pre>
          <textarea
            ref="editorRef"
            class="math-source"
            data-testid="math-field-source"
            rows="2"
            spellcheck="false"
            :value="source"
            :aria-label="`Math expression source. ${data.errorMessage ?? ''}`"
            @input="onInput"
            @blur="commitEdit(false)"
            @keydown.enter.prevent="commitEdit(true)"
            @keydown.esc.stop.prevent="cancelEdit"
            @pointerdown.stop
          ></textarea>
        </div>
      </div>

      <div
        class="math-error"
        v-if="!data.isValid"
        data-testid="math-error"
        :title="data.errorMessage"
        role="alert"
      >
        {{ data.errorMessage }}
      </div>

      <div class="math-sockets">
        <div
          class="math-socket-row"
          v-for="[key, input] in inputs()"
          :key="key"
        >
          <Ref
            class="math-socket"
            :data-testid="`math-input-socket-${key}`"
            :emit="emit"
            :data="{ type: 'socket', side: 'input', key, btType: input.socket?.name ?? key, nodeId: data.id, payload: input }"
          />
          <span class="math-socket-label">{{ key }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {
  computed,
  defineComponent,
  nextTick,
  onMounted,
  onUpdated,
  ref,
  type PropType,
} from "vue";
import { Ref } from "rete-vue-plugin";
import type { MathExpressionNode } from "../rete/nodes/mathexpressionnode";
import {
  getMathRenderer,
  type RenderedMath,
} from "../rete/nodes/math-renderer";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Light syntax tint over the raw source. Tokenize first, then escape each
 * piece: escaping before matching would let the regex rewrite the generated
 * `<span class="tok-…">` markup itself.
 */
const TOKEN_RE = /(\d+(?:\.\d+)?(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([+\-*/%^~<>=!]+)/g;

export function highlight(source: string): string {
  let html = "";
  let last = 0;
  for (const match of source.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    html += escapeHtml(source.slice(last, index));
    const cls =
      match[1] != null ? "tok-number" : match[2] != null ? "tok-ident" : "tok-op";
    html += `<span class="${cls}">${escapeHtml(match[0])}</span>`;
    last = index + match[0].length;
  }
  html += escapeHtml(source.slice(last));
  return html + "\n";
}

export default defineComponent({
  name: "MathExpressionNodeView",
  components: { Ref },
  props: {
    data: { type: Object as PropType<MathExpressionNode>, required: true },
    emit: { type: Function, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    // rete-vue-plugin passes a fresh random seed on every node re-render;
    // keying the return port on it remounts the socket component so its
    // type label/colour follow a retyped output (same trick as OnshapeNode).
    seed: { type: Number, default: 0 },
  },
  setup(props) {
    /**
     * Local, reactive copy of the node's plain-text source. The node's
     * `source` is a plain class field, so a computed over it never updates
     * (the invisible-text bug); this ref is what the editor renders.
     */
    const source = ref(props.data.source);
    const editing = ref(false);
    /** Source before the edit began, restored by Escape. */
    let beforeEdit = props.data.source;
    const fieldRef = ref<HTMLButtonElement | null>(null);
    const editorRef = ref<HTMLTextAreaElement | null>(null);

    /** Pull external changes (load, undo, group defaults) into the editor. */
    function syncFromData(): void {
      if (!editing.value && props.data.source !== source.value) {
        source.value = props.data.source;
      }
    }

    onMounted(syncFromData);
    // rete's vue plugin re-renders this component on `area.update("node")`;
    // onUpdated is where an external `setSource` becomes visible.
    onUpdated(syncFromData);

    const rendered = computed<RenderedMath | null>(() => {
      // Depend on the reactive source: recompute on edit/commit/external sync.
      void source.value;
      const latex = props.data.getLatex();
      // The field is the formula, so typeset it in display style: a fraction
      // reads at full size instead of the cramped inline form.
      return latex != null ? getMathRenderer().render(latex, { displayMode: true }) : null;
    });

    const highlightedSource = computed(() => highlight(source.value));
    const isEmpty = computed(() => source.value.trim() === "");

    function syncNode(): void {
      props.data.setSource(source.value);
      props.data.update();
    }

    function autoGrow(): void {
      const el = editorRef.value;
      if (el == null) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }

    async function beginEdit(): Promise<void> {
      beforeEdit = source.value;
      editing.value = true;
      await nextTick();
      const el = editorRef.value;
      if (el == null) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
      autoGrow();
    }

    function onInput(event: Event): void {
      source.value = (event.target as HTMLTextAreaElement).value;
      syncNode();
      autoGrow();
    }

    /** Blur or Enter: keep the draft, re-typeset in place. */
    function commitEdit(refocus = false): void {
      if (!editing.value) return;
      syncNode();
      editing.value = false;
      if (refocus) void nextTick(() => fieldRef.value?.focus());
    }

    /** Escape: discard the draft, restore the previous source, re-typeset. */
    function cancelEdit(): void {
      if (!editing.value) return;
      source.value = beforeEdit;
      syncNode();
      editing.value = false;
      void nextTick(() => fieldRef.value?.focus());
    }

    function toggleCollapse(): void {
      props.data.setCollapsed(!props.data.collapsed);
      props.data.update();
    }

    return {
      source,
      editing,
      rendered,
      highlightedSource,
      isEmpty,
      fieldRef,
      editorRef,
      beginEdit,
      onInput,
      commitEdit,
      cancelEdit,
      toggleCollapse,
      inputs: () => Object.entries(props.data.inputs),
      returnOutput: () => props.data.outputs["return"],
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
  /* Clip to the card: an overflowing child would otherwise inflate the
     node width through the frame size observer. The port row's -1px offset
     keeps the visible socket right against the border without spilling. */
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
  /* Same 14px/700 sans title scale as every Onshape node (STYLE_GUIDE
     Typography); the typeset expression is a title, not a literal. */
  font-family: var(--font-sans, 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif);
  font-size: var(--font-size-title, 14px);
  font-weight: var(--font-weight-title, 700);
  line-height: var(--line-height-title, 1.2);
  color: var(--text-primary);
}

.math-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
}

/* Return socket row: top-right, outside the collapsible body, so the port is
   available expanded and collapsed and never overlaps the formula field. */
.math-output-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  height: 16px;
  box-sizing: border-box;
  padding: 2px 0 0 8px;
}

.math-output-label {
  font-family: var(--font-sans);
  font-size: var(--font-size-meta);
  line-height: 1;
  color: var(--text-primary);
  opacity: var(--opacity-secondary);
}

/* Keep the 12px port box inside the card's right edge (overflow is clipped),
   so the visible socket hugs the border without inflating the node width. */
.math-output-socket {
  margin-right: -1px;
}

.math-body {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* The field: one box that is the formula when idle and the source when
   edited. Sunken surface + hairline reads as editable without heavy chrome. */
.math-field {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 50px;
  padding: 5px 7px;
  background: var(--surface-sunken);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-control);
}

.math-field:hover {
  border-color: var(--border-hairline);
}

.math-field:focus-within {
  border-color: var(--accent);
}

.math-field.invalid {
  border-color: var(--danger);
}

.math-field-idle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin: 0;
  padding: 0;
  background: none;
  border: none;
  font: inherit;
  color: var(--text-primary);
  text-align: left;
  cursor: text;
}

.math-field-idle:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: 2px;
}

.math-rendered {
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  font-size: var(--font-size-value);
  line-height: 1.4;
}

/* Display-style KaTeX brings its own block margins; the field owns layout. */
.math-rendered :deep(.katex-display) {
  margin: 0;
}

/* KaTeX centers display math itself; a field's content starts at the left. */
.math-rendered :deep(.katex-display > .katex) {
  text-align: left;
}

.math-placeholder {
  flex: 1 1 auto;
  font-family: var(--font-mono);
  font-size: var(--font-size-field);
  color: var(--text-secondary);
  opacity: var(--opacity-secondary);
}

.math-fallback {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: var(--font-size-field);
  color: var(--text-primary);
  text-decoration: underline wavy var(--danger);
  text-underline-offset: 3px;
}

/* Subtle affordance: faint until the field is hovered/focused. */
.math-edit-cue {
  flex: 0 0 auto;
  color: var(--text-secondary);
  opacity: var(--opacity-faint);
}

.math-field-idle:hover .math-edit-cue,
.math-field-idle:focus-visible .math-edit-cue {
  opacity: var(--opacity-secondary);
}

.math-source-wrap {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  font-family: var(--font-mono);
  font-size: var(--font-size-field);
}

.math-highlight,
.math-source {
  font: inherit;
  line-height: 1.4;
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: break-word;
}

.math-highlight {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: var(--text-primary);
}

.math-highlight code {
  font: inherit;
}

.math-source {
  position: relative;
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 2.8em;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  color: transparent;
  caret-color: var(--text-primary);
}

.math-source::selection {
  background: var(--active-tint);
}

.tok-number {
  color: var(--text-secondary);
}

.tok-op {
  color: var(--text-secondary);
  opacity: var(--opacity-secondary);
}

.tok-ident {
  color: var(--text-primary);
}

.math-error {
  color: var(--danger);
  font-size: var(--font-size-meta);
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
