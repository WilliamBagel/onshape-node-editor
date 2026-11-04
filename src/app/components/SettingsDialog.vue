<!--
  SettingsDialog.vue — #36 content for the wide dialog variant.

  Rendered inside AppDialog (the single #34 modal host) when the service's
  current request is kind === 'settings'. Preferences and shortcut bindings
  persist immediately through the framework-free store in ../ui/editorSettings
  (browserStorage / MemoryStorage fallback), so Done/Cancel only close.
  Canvas changes apply live: grid visibility via applyCanvasPreferences,
  snap size / modifiers are read by editorbase on every drag/select check.
  Only shortcuts the app actually honours are listed (see COMMANDS);
  Save / Open / Search are named as omitted, never given a fake binding.
-->
<template>
  <div class="settings">
    <section aria-labelledby="settings-prefs">
      <h3 id="settings-prefs" class="settings-heading">Canvas &amp; preferences</h3>

      <label class="settings-row">
        <span class="settings-row-text">
          <span class="settings-label">Show canvas grid</span>
          <span class="settings-meta">Default: on. Hides or shows the grid background.</span>
        </span>
        <input v-model="prefs.showGrid" type="checkbox" class="settings-check" @change="savePref('showGrid')" />
      </label>

      <label class="settings-row">
        <span class="settings-row-text">
          <span class="settings-label">Snap nodes to grid while dragging</span>
          <span class="settings-meta">Default: on. Snap only happens while the snap modifier is held.</span>
        </span>
        <input v-model="prefs.snapEnabled" type="checkbox" class="settings-check" @change="savePref('snapEnabled')" />
      </label>

      <div class="settings-row">
        <span class="settings-row-text">
          <span class="settings-label">Grid snap size</span>
          <span class="settings-meta">Default: 20px. Allowed: 4–80px.</span>
        </span>
        <input v-model.number="prefs.snapGridSize" type="number" min="4" max="80" step="1"
          class="settings-number" @change="savePref('snapGridSize')" />
      </div>
      <p v-if="prefError" class="settings-error" role="alert">{{ prefError }}</p>

      <div class="settings-row">
        <span class="settings-row-text">
          <span class="settings-label">Snap modifier (hold while dragging)</span>
          <span class="settings-meta">Default: Control.</span>
        </span>
        <select v-model="prefs.snapModifier" class="settings-select" @change="saveModifier('snapModifier')">
          <option v-for="m in MODIFIER_KEYS" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>

      <div class="settings-row">
        <span class="settings-row-text">
          <span class="settings-label">Accumulate-selection modifier (hold while selecting)</span>
          <span class="settings-meta">Default: Shift. Must differ from the snap modifier.</span>
        </span>
        <select v-model="prefs.accumulateModifier" class="settings-select" @change="saveModifier('accumulateModifier')">
          <option v-for="m in MODIFIER_KEYS" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
    </section>

    <section aria-labelledby="settings-shortcuts">
      <h3 id="settings-shortcuts" class="settings-heading">Keyboard shortcuts</h3>
      <p class="settings-meta">Shortcuts fire anywhere except while typing in a field. Click Rebind, then press the new keys (Esc cancels).</p>

      <div v-for="cmd in COMMANDS" :key="cmd.id" class="settings-row">
        <span class="settings-row-text">
          <span class="settings-label">{{ cmd.label }}</span>
          <span class="settings-meta">{{ cmd.description }}</span>
        </span>
        <span class="settings-shortcut-actions">
          <kbd v-if="capturing !== cmd.id" class="settings-keycap">{{ bindings[cmd.id] }}</kbd>
          <kbd v-else class="settings-keycap settings-keycap--capturing">Press keys…</kbd>
          <button type="button" class="settings-btn" @click="startCapture(cmd.id)">Rebind</button>
          <button type="button" class="settings-btn settings-btn--ghost" @click="resetBinding(cmd.id)">Reset</button>
        </span>
      </div>
      <p v-if="shortcutError" class="settings-error" role="alert">{{ shortcutError }}</p>
    </section>

    <section aria-labelledby="settings-targets">
      <h3 id="settings-targets" class="settings-heading">Build &amp; Run defaults</h3>
      <p class="settings-meta">
        These deploy targets are already persisted by the app (browser storage) and are edited
        from the toolbar target buttons; they are shown here read-only so this dialog does not
        duplicate that editing.
      </p>
      <div class="settings-row">
        <span class="settings-row-text">
          <span class="settings-label">Upload target (Feature Studio)</span>
          <span class="settings-value settings-value--mono">{{ uploadTarget }}</span>
        </span>
      </div>
      <div class="settings-row">
        <span class="settings-row-text">
          <span class="settings-label">Run target (Part Studio)</span>
          <span class="settings-value settings-value--mono">{{ runTarget }}</span>
        </span>
      </div>
    </section>

    <section v-if="OMITTED_COMMANDS.length > 0" aria-labelledby="settings-omitted">
      <h3 id="settings-omitted" class="settings-heading">Not bound</h3>
      <p v-for="item in OMITTED_COMMANDS" :key="item.label" class="settings-meta">
        {{ item.label }} — no shortcut: {{ item.reason }}
      </p>
    </section>

    <div class="settings-footer">
      <button type="button" class="settings-btn settings-btn--ghost" @click="resetAll">Reset all settings</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import {
  COMMANDS,
  MODIFIER_KEYS,
  OMITTED_COMMANDS,
  applyCanvasPreferences,
  editorSettings,
  normalizeCombo,
  type CommandId,
  type EditorPreferences,
  type ModifierKey,
  type ShortcutBindings,
} from '../ui/editorSettings';
import {
  browserStorage,
  FeatureStudioTargetSettings,
  formatTarget,
  MemoryStorage,
} from '../onshape-utils/featurestudiotarget';
import { PartStudioTargetSettings } from '../onshape-utils/partstudiofeature';

export default defineComponent({
  name: 'SettingsDialog',
  data() {
    return {
      COMMANDS,
      MODIFIER_KEYS,
      OMITTED_COMMANDS,
      prefs: editorSettings.getPreferences() as EditorPreferences,
      bindings: editorSettings.getBindings() as ShortcutBindings,
      capturing: null as CommandId | null,
      shortcutError: '',
      prefError: '',
      uploadTarget: 'Not set',
      runTarget: 'Not set',
    };
  },
  mounted() {
    const storage = browserStorage() ?? new MemoryStorage();
    const upload = new FeatureStudioTargetSettings(storage).get();
    const run = new PartStudioTargetSettings(storage).get();
    this.uploadTarget = upload ? formatTarget(upload) : 'Not set';
    this.runTarget = run ? formatTarget(run) : 'Not set';
    window.addEventListener('keydown', this.onCaptureKeydown, true);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onCaptureKeydown, true);
  },
  methods: {
    applyPrefs() {
      applyCanvasPreferences(document, this.prefs);
    },
    savePref(key: 'showGrid' | 'snapEnabled' | 'snapGridSize') {
      this.prefError = '';
      const value = key === 'snapGridSize' ? this.prefs.snapGridSize : this.prefs[key];
      if (!editorSettings.setPreference(key, value as never)) {
        this.prefError = key === 'snapGridSize'
          ? 'Grid snap size must be a whole number between 4 and 80.'
          : 'That preference could not be saved.';
        this.prefs = editorSettings.getPreferences();
        return;
      }
      this.prefs = editorSettings.getPreferences();
      this.applyPrefs();
    },
    saveModifier(key: 'snapModifier' | 'accumulateModifier') {
      this.prefError = '';
      if (!editorSettings.setPreference(key, this.prefs[key] as ModifierKey)) {
        this.prefError = 'The two canvas modifiers must be different keys.';
        this.prefs = editorSettings.getPreferences();
      } else {
        this.prefs = editorSettings.getPreferences();
      }
    },
    startCapture(id: CommandId) {
      this.capturing = id;
      this.shortcutError = '';
    },
    onCaptureKeydown(event: KeyboardEvent) {
      if (this.capturing == null) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        this.capturing = null;
        return;
      }
      const combo = normalizeCombo(event);
      if (combo == null) return;
      const result = editorSettings.setBinding(this.capturing, combo);
      if (!result.ok && 'error' in result) {
        this.shortcutError = result.error;
        this.capturing = null;
        return;
      }
      this.bindings = editorSettings.getBindings();
      this.capturing = null;
    },
    resetBinding(id: CommandId) {
      editorSettings.resetBinding(id);
      this.bindings = editorSettings.getBindings();
      this.shortcutError = '';
    },
    resetAll() {
      editorSettings.resetAll();
      this.prefs = editorSettings.getPreferences();
      this.bindings = editorSettings.getBindings();
      this.shortcutError = '';
      this.prefError = '';
      this.applyPrefs();
    },
  },
});
</script>

<style scoped>
.settings {
  font-family: var(--font-sans);
  color: var(--ink);
  text-align: left;
  /* #73: breathing room so content never touches the dialog frame. */
  padding: 8px 4px 16px;
}
.settings section + section { margin-top: 16px; }
.settings-heading {
  margin: 8px 0 8px;
  font-size: var(--font-size-heading);
  font-weight: 600;
  line-height: var(--line-height-title);
}
.settings-heading:first-child { margin-top: 4px; }
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--hairline);
}
.settings-row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.settings-label { font-size: var(--font-size-label); line-height: var(--line-height-body); }
.settings-value { font-size: var(--font-size-value); line-height: var(--line-height-body); overflow-wrap: anywhere; }
.settings-value--mono { font-family: var(--font-mono); font-size: var(--font-size-literal); }
.settings-meta {
  margin: 2px 0;
  font-size: var(--font-size-meta);
  line-height: var(--line-height-body);
  color: var(--ink);
  opacity: 0.6;
}
.settings-check {
  width: 16px; height: 16px; flex: none;
  accent-color: var(--accent-steel);
}
.settings-number, .settings-select {
  height: 28px; padding: 0 8px; flex: none;
  font-family: var(--font-sans); font-size: var(--font-size-value); color: var(--ink);
  background: var(--surface); border: 1px solid var(--hairline); border-radius: var(--radius-control);
}
.settings-number:focus, .settings-select:focus {
  border-color: var(--accent-steel); box-shadow: 0 0 0 1px var(--accent-steel); outline: none;
}
.settings-shortcut-actions { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.settings-keycap {
  font-family: var(--font-mono); font-size: var(--font-size-meta);
  padding: 2px 6px; border: 1px solid var(--hairline); border-radius: var(--radius-keycap);
  background: var(--surface-panel); color: var(--ink);
}
.settings-keycap--capturing { border-color: var(--accent-steel); color: var(--accent-steel); }
.settings-btn {
  height: 26px; padding: 0 10px;
  font-family: var(--font-sans); font-size: var(--font-size-label); font-weight: 600;
  border: 1px solid var(--hairline); border-radius: var(--radius-control);
  background: var(--surface-panel); color: var(--ink); cursor: pointer; box-sizing: border-box;
}
.settings-btn:hover { border-color: var(--hairline-strong); }
.settings-btn:focus-visible { outline: 2px solid var(--accent-steel); outline-offset: 1px; }
.settings-btn--ghost { font-weight: 400; opacity: 0.6; }
.settings-btn--ghost:hover { opacity: 1; }
.settings-error { margin: 6px 0 0; font-size: var(--font-size-meta); color: var(--error); }
.settings-footer { display: flex; justify-content: flex-start; padding-top: 12px; }
</style>
