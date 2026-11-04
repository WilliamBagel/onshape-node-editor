<!--
  DebugGrid.vue — debug grid overlay / node-wrangler view (#16).

  A panel listing every node output's live value (node, socket, type, units,
  value) by reusing the #15 harness (`evaluateDebugScript`) with an injected
  API and a bounded refresh: one request in flight, stale responses dropped
  by monotonic request id, graph-change refreshes debounced (#16).

  Anything the panel renders is built by `../ui/debuggrid` (row model,
  filter/sort, error attribution, empty-state decision, preferences), so the
  logic is unit tested without a DOM. Column visibility, error filter and
  sort persist through `editorSettings`.
-->
<template>
  <div v-if="open" class="debug-grid-backdrop" @click.self="onClose">
    <div ref="panel" class="debug-grid" role="dialog" aria-modal="false" aria-label="Debug grid">
      <div class="debug-grid-header">
        <h2 class="debug-grid-title">Debug grid</h2>
        <span v-if="statusText" class="debug-grid-status" role="status">{{ statusText }}</span>
        <div class="debug-grid-actions">
          <button type="button" class="debug-grid-btn" :disabled="refreshing" @click="refresh">
            {{ refreshing ? 'Refreshing…' : 'Refresh' }}
          </button>
          <button type="button" class="debug-grid-btn debug-grid-btn--ghost" @click="onClose">Close</button>
        </div>
      </div>

      <div class="debug-grid-toolbar">
        <label class="debug-grid-field">
          <span class="debug-grid-label">Filter</span>
          <input v-model="filter" type="search" class="debug-grid-input" placeholder="node, socket, type, value, error…" />
        </label>
        <label class="debug-grid-check">
          <input v-model="showOnlyErrors" type="checkbox" @change="savePref('showOnlyErrors')" />
          <span>Show only errors</span>
        </label>
        <fieldset class="debug-grid-columns">
          <legend class="debug-grid-label">Columns</legend>
          <label v-for="col in allColumns" :key="col" class="debug-grid-check debug-grid-check--small">
            <input type="checkbox" :checked="prefs.columns.includes(col)" @change="toggleColumn(col, $event)" />
            <span>{{ col }}</span>
          </label>
        </fieldset>
        <span class="debug-grid-meta">{{ visibleRows.length }} / {{ rows.length }} rows</span>
      </div>

      <div v-if="emptyState !== 'ready'" class="debug-grid-empty" role="alert">
        {{ emptyStateMessage }}
        <span v-if="failureMessage" class="debug-grid-failure">{{ failureMessage }}</span>
      </div>

      <div v-else class="debug-grid-table-wrap">
        <table class="debug-grid-table">
          <thead>
            <tr>
              <th class="debug-grid-th debug-grid-th--pin" :title="'Pin a row to keep it at the top'">pin</th>
              <th
                v-for="col in displayColumns"
                :key="col"
                class="debug-grid-th"
                @click="onSort(col)"
              >
                {{ col }}{{ sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '' }}
              </th>
              <th class="debug-grid-th">errors</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRows"
              :key="row.key"
              class="debug-grid-row"
              :class="{ 'debug-grid-row--pinned': row.pinned }"
              @click="onSelectNode(row)"
            >
              <td class="debug-grid-td debug-grid-td--pin" @click.stop="togglePin(row)">
                <button
                  type="button"
                  class="debug-grid-pin"
                  :aria-pressed="row.pinned"
                  :title="row.pinned ? 'Unpin row' : 'Pin row'"
                >{{ row.pinned ? '●' : '○' }}</button>
              </td>
              <td
                v-for="col in displayColumns"
                :key="col"
                class="debug-grid-td"
                :class="{ 'debug-grid-td--value': col === 'value', 'debug-grid-td--node': col === 'node' }"
                :title="'Copy ' + col"
                @dblclick.stop="copyCell(row, col)"
              >{{ cellText(row, col) }}</td>
              <td class="debug-grid-td debug-grid-td--errors">
                <span v-if="row.errors.length === 0" class="debug-grid-meta">—</span>
                <span v-else class="debug-grid-error">{{ row.errors.join(' ') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="debug-grid-footer">
        <button type="button" class="debug-grid-btn debug-grid-btn--ghost" :disabled="visibleRows.length === 0" @click="copyVisibleRows">
          Copy visible rows
        </button>
        <details v-if="scriptText" class="debug-grid-script">
          <summary>Evaluated script</summary>
          <pre>{{ scriptText }}</pre>
        </details>
        <span v-if="copiedText" class="debug-grid-meta" role="status">{{ copiedText }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import {
    evaluateDebugScript,
    type DebugEvalResult,
    type DebugNodeSource,
    type DebugSelection,
    type EvalFeatureScriptApiLike,
} from '../onshape-utils/evalfeaturescript';
import type { FeatureStudioTarget } from '../onshape-utils/featurestudiotarget';
import {
    applyDebugGridView,
    buildDebugRows,
    createDebouncedRefresh,
    decideDebugGridEmptyState,
    debugCellCopyText,
    debugRowCopyText,
    DEBUG_GRID_COLUMNS,
    DEBUG_GRID_DEBOUNCE_MS,
    DEBUG_GRID_EMPTY_STATE_MESSAGES,
    type DebugGridColumnId,
    type DebugGridPreferences,
    type DebugGridRow,
} from '../ui/debuggrid';
import { editorSettings } from '../ui/editorSettings';

type SettingsStoreLike = {
    getPreferences: () => { debugGrid: DebugGridPreferences };
    setDebugGridPreference: (key: keyof DebugGridPreferences, value: DebugGridPreferences[keyof DebugGridPreferences]) => boolean;
};

let requestSeq = 0;

export default defineComponent({
    name: 'DebugGrid',
    props: {
        open: { type: Boolean, required: true },
        nodes: { type: Array as PropType<DebugNodeSource[]>, required: true },
        selections: { type: Array as PropType<DebugSelection[]>, required: true },
        target: { type: Object as PropType<FeatureStudioTarget | null>, default: null },
        api: { type: Object as PropType<EvalFeatureScriptApiLike | null>, default: null },
        microversion: { type: String as PropType<string | null>, default: null },
        /** Increments whenever the graph changes; refresh is debounced on it. */
        graphVersion: { type: Number, default: 0 },
        settings: { type: Object as PropType<SettingsStoreLike | null>, default: null },
    },
    emits: {
        close: () => true,
        'select-node': (_nodeId: string) => true,
    },
    data() {
        return {
            /** Last harness result; `null` until the first successful refresh. */
            result: null as DebugEvalResult | null,
            /** Failure of the last refresh attempt (drives the failed state). */
            failure: null as string | null,
            refreshing: false,
            /** In-flight request id; older responses are stale and dropped. */
            activeRequest: 0,
            filter: '',
            pinnedKeys: new Set<string>(),
            copiedText: '',
            scriptText: '',
            debouncedRefresh: null as ReturnType<typeof createDebouncedRefresh> | null,
        };
    },
    computed: {
        store(): SettingsStoreLike {
            return this.settings ?? editorSettings;
        },
        prefs(): DebugGridPreferences {
            return this.store.getPreferences().debugGrid;
        },
        allColumns(): DebugGridColumnId[] {
            return DEBUG_GRID_COLUMNS;
        },
        displayColumns(): DebugGridColumnId[] {
            return this.prefs.columns.filter((c) => DEBUG_GRID_COLUMNS.includes(c));
        },
        sortBy(): DebugGridColumnId | 'pinned' {
            return this.prefs.sortBy;
        },
        sortDir(): 'asc' | 'desc' {
            return this.prefs.sortDir;
        },
        showOnlyErrors: {
            get(): boolean {
                return this.prefs.showOnlyErrors;
            },
            set(v: boolean) {
                this.store.setDebugGridPreference('showOnlyErrors', v);
            },
        },
        rows(): DebugGridRow[] {
            return buildDebugRows({
                selections: this.selections,
                values: this.result?.values ?? {},
                errors: this.result?.errors ?? [],
                pinnedKeys: this.pinnedKeys,
            });
        },
        visibleRows(): DebugGridRow[] {
            return applyDebugGridView(this.rows, {
                filter: this.filter,
                showOnlyErrors: this.showOnlyErrors,
                sortBy: this.sortBy,
                sortDir: this.sortDir,
            });
        },
        emptyState(): ReturnType<typeof decideDebugGridEmptyState> {
            return decideDebugGridEmptyState({
                hasTarget: this.target != null && this.api != null && this.nodes.length > 0,
                hasMicroversion: this.microversion != null && this.microversion !== '',
                selectionCount: this.selections.length,
                rowCount: this.visibleRows.length,
                evaluated: this.result != null,
                failed: this.failure != null,
            });
        },
        failureMessage(): string {
            return this.failure ?? '';
        },
        emptyStateMessage(): string {
            return DEBUG_GRID_EMPTY_STATE_MESSAGES[this.emptyState as Exclude<ReturnType<typeof decideDebugGridEmptyState>, 'ready'>] ?? '';
        },
        statusText(): string {
            if (this.refreshing) return 'Evaluating…';
            if (this.failure != null) return 'Last evaluation failed.';
            if (this.result != null) return `Evaluated ${Object.keys(this.result.values).length} value(s). Click a row to focus its node.`;
            return 'Press Refresh to evaluate the graph.';
        },
    },
    watch: {
        open(isOpen: boolean) {
            if (isOpen) {
                this.$nextTick(() => {
                    (this.$refs.panel as HTMLElement | undefined)?.focus?.();
                });
            }
        },
        graphVersion() {
            if (!this.open || this.result == null) return;
            this.debouncedRefresh?.call();
        },
    },
    created() {
        this.debouncedRefresh = createDebouncedRefresh(() => {
            void this.refresh();
        }, DEBUG_GRID_DEBOUNCE_MS);
    },
    beforeUnmount() {
        this.debouncedRefresh?.cancel();
    },
    methods: {
        async refresh(): Promise<void> {
            if (!this.open || this.refreshing) return;
            const target = this.target;
            const api = this.api;
            if (target == null || api == null || this.microversion == null || this.microversion === '' || this.nodes.length === 0) {
                this.failure = 'No Part Studio target, microversion or node sources to evaluate.';
                return;
            }
            const requestId = ++requestSeq;
            this.activeRequest = requestId;
            this.refreshing = true;
            try {
                const result = await evaluateDebugScript(api, target, this.microversion, this.nodes, this.selections);
                if (requestId !== this.activeRequest) return; // superseded while in flight
                this.result = result;
                this.failure = null;
                this.scriptText = result.script;
            } catch (err) {
                if (requestId !== this.activeRequest) return;
                this.failure = err instanceof Error ? err.message : 'Evaluation failed.';
            } finally {
                if (requestId === this.activeRequest) this.refreshing = false;
            }
        },
        onClose() {
            this.$emit('close');
        },
        onSelectNode(row: DebugGridRow) {
            this.$emit('select-node', row.nodeId);
        },
        onSort(col: DebugGridColumnId) {
            if (this.sortBy === col) {
                this.store.setDebugGridPreference('sortDir', this.sortDir === 'asc' ? 'desc' : 'asc');
            } else {
                this.store.setDebugGridPreference('sortBy', col);
                this.store.setDebugGridPreference('sortDir', 'asc');
            }
        },
        toggleColumn(col: DebugGridColumnId, event: Event) {
            const checked = (event.target as HTMLInputElement).checked;
            const next = checked
                ? [...this.prefs.columns, col]
                : this.prefs.columns.filter((c) => c !== col);
            // Keep canonical column order regardless of toggle order.
            const ordered = DEBUG_GRID_COLUMNS.filter((c) => next.includes(c));
            this.store.setDebugGridPreference('columns', ordered);
        },
        savePref(key: 'showOnlyErrors') {
            this.store.setDebugGridPreference(key, this.showOnlyErrors);
        },
        togglePin(row: DebugGridRow) {
            const next = new Set(this.pinnedKeys);
            if (next.has(row.key)) next.delete(row.key);
            else next.add(row.key);
            this.pinnedKeys = next;
        },
        cellText(row: DebugGridRow, col: DebugGridColumnId): string {
            return debugCellCopyText(row, col);
        },
        async copyText(text: string, label: string) {
            try {
                await navigator.clipboard.writeText(text);
                this.copiedText = `Copied ${label}.`;
            } catch {
                this.copiedText = 'Copy unavailable (clipboard denied).';
            }
        },
        copyCell(row: DebugGridRow, col: DebugGridColumnId) {
            void this.copyText(debugCellCopyText(row, col), col);
        },
        copyVisibleRows() {
            const text = this.visibleRows.map((row) => debugRowCopyText(row, this.displayColumns)).join('\n');
            void this.copyText(text, 'visible rows');
        },
    },
});
</script>

<style scoped>
.debug-grid-backdrop {
  position: fixed;
  inset: 0;
  background: var(--backdrop-scrim);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
}
.debug-grid {
  width: min(880px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  box-shadow: var(--shadow-1);
  font-family: var(--font-sans);
  color: var(--ink);
}
.debug-grid-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 8px;
}
.debug-grid-title {
  margin: 0;
  font-size: var(--font-size-heading);
  font-weight: var(--font-weight-title);
  line-height: var(--line-height-title);
}
.debug-grid-status {
  font-size: var(--font-size-meta);
  font-weight: 400;
  line-height: var(--line-height-body);
  color: var(--ink);
  opacity: var(--opacity-secondary);
}
.debug-grid-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.debug-grid-btn {
  height: 28px;
  padding: 0 12px;
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-section);
  line-height: var(--line-height-body);
  border-radius: var(--radius-control);
  border: 1px solid var(--accent-steel);
  background: var(--accent-steel);
  color: var(--on-steel);
  cursor: pointer;
}
.debug-grid-btn:hover {
  filter: brightness(1.08);
}
.debug-grid-btn:focus-visible {
  outline: 2px solid var(--accent-steel);
  outline-offset: 1px;
}
.debug-grid-btn--ghost {
  background: var(--surface-panel);
  border-color: var(--hairline);
  color: var(--ink);
  opacity: var(--opacity-secondary);
  font-weight: 400;
}
.debug-grid-btn--ghost:hover {
  opacity: 1;
  filter: none;
}
.debug-grid-btn:disabled {
  cursor: default;
  opacity: var(--opacity-faint);
}
.debug-grid-toolbar {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px 16px 10px;
  border-bottom: 1px solid var(--hairline);
}
.debug-grid-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.debug-grid-label {
  font-size: var(--font-size-label);
  font-weight: 400;
  line-height: var(--line-height-body);
  color: var(--ink);
  opacity: var(--opacity-secondary);
}
.debug-grid-input {
  box-sizing: border-box;
  width: 200px;
  height: 28px;
  padding: 0 8px;
  font-family: var(--font-sans);
  font-size: var(--font-size-value);
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-control);
  outline: none;
}
.debug-grid-input:focus {
  border-color: var(--accent-steel);
  box-shadow: 0 0 0 1px var(--accent-steel);
}
.debug-grid-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-label);
  line-height: var(--line-height-body);
  color: var(--ink);
}
.debug-grid-check--small {
  font-size: var(--font-size-meta);
}
.debug-grid-columns {
  display: flex;
  gap: 8px;
  border: none;
  margin: 0;
  padding: 0;
}
.debug-grid-columns legend {
  padding: 0;
}
.debug-grid-meta {
  font-size: var(--font-size-meta);
  font-weight: 400;
  line-height: var(--line-height-body);
  color: var(--ink);
  opacity: var(--opacity-secondary);
}
.debug-grid-empty {
  padding: 20px 16px;
  font-size: var(--font-size-value);
  line-height: var(--line-height-body);
  color: var(--ink);
  opacity: var(--opacity-secondary);
}
.debug-grid-failure {
  display: block;
  margin-top: 6px;
  font-size: var(--font-size-meta);
  color: var(--error);
  opacity: 1;
}
.debug-grid-table-wrap {
  overflow: auto;
  max-height: 52vh;
}
.debug-grid-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-value);
  line-height: var(--line-height-body);
}
.debug-grid-th {
  text-align: left;
  font-size: var(--font-size-meta);
  font-weight: var(--font-weight-section);
  color: var(--ink);
  opacity: var(--opacity-secondary);
  padding: 6px 8px;
  border-bottom: 1px solid var(--hairline);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.debug-grid-th--pin {
  cursor: default;
  width: 28px;
}
.debug-grid-row {
  cursor: pointer;
  border-bottom: 1px solid var(--border-subtle);
}
.debug-grid-row:hover {
  background: var(--hover-tint);
}
.debug-grid-row--pinned {
  background: var(--surface-sunken);
}
.debug-grid-td {
  padding: 5px 8px;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.debug-grid-td--pin {
  width: 28px;
}
.debug-grid-td--node {
  font-family: var(--font-mono);
  font-size: var(--font-size-literal);
}
.debug-grid-td--value {
  font-family: var(--font-mono);
  font-size: var(--font-size-literal);
}
.debug-grid-td--errors {
  max-width: 240px;
}
.debug-grid-pin {
  background: none;
  border: none;
  color: var(--accent-steel);
  cursor: pointer;
  font-size: var(--font-size-label);
  padding: 0 4px;
}
.debug-grid-pin:focus-visible {
  outline: 2px solid var(--accent-steel);
  outline-offset: 1px;
}
.debug-grid-error {
  color: var(--error);
  font-size: var(--font-size-meta);
  line-height: var(--line-height-body);
}
.debug-grid-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px 12px;
  border-top: 1px solid var(--hairline);
}
.debug-grid-script {
  font-size: var(--font-size-meta);
  color: var(--ink);
  opacity: var(--opacity-secondary);
}
.debug-grid-script pre {
  max-height: 160px;
  overflow: auto;
  font-family: var(--font-mono);
  font-size: var(--font-size-literal);
  background: var(--surface-panel);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-control);
  padding: 8px;
}
</style>
