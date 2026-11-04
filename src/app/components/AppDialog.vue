<!--
  AppDialog.vue — the single in-app dialog host (#34).

  Renders `dialogService.current` from `../ui/dialog` (text prompt and yes/no
  confirmation variants). Mounted once in App.vue; nothing else renders a
  dialog. Replaces every browser-default browser prompt / browser confirm.

  Behaviour: Escape cancels, Enter submits, clicks on the backdrop cancel,
  focus is trapped inside the dialog while it is open and returns to the
  previously focused element on close. Prompt validation (empty input) comes
  from the service so the rules are unit-tested without a DOM.

  Styled per STYLE_GUIDE.md ("Not default-AI" palette): white card, 1px
  hairline, 5px radius, shadow no heavier than the guide maximum, warm ink
  with opacity hierarchy, steel blue reserved for the primary action and the
  focus ring, and the 14/13/12/11 type scale (11px is meta only).
-->
<template>
  <div
    v-if="current !== null"
    class="app-dialog-backdrop"
    @click.self="onCancel"
    @keydown="onKeydown"
  >
    <div
      ref="dialog"
      class="app-dialog"
      :class="{ 'app-dialog--wide': current.kind === 'settings' }"
      role="dialog"
      aria-modal="true"
      :aria-label="current.title"
    >
      <div class="app-dialog-header">
        <h2 class="app-dialog-title">{{ current.title }}</h2>
      </div>

      <div class="app-dialog-body">
        <p v-if="current.body" class="app-dialog-text">{{ current.body }}</p>

        <template v-if="current.kind === 'prompt'">
          <label class="app-dialog-field">
            <span class="app-dialog-label">{{ current.label ?? current.title }}</span>
            <input
              ref="input"
              v-model="inputValue"
              type="text"
              class="app-dialog-input"
              :class="{ 'app-dialog-input--mono': current.mono }"
              :placeholder="current.placeholder"
              @keydown.enter.prevent="onSubmit"
            />
          </label>
          <p v-if="error" class="app-dialog-error" role="alert">{{ error }}</p>
        </template>
        <!-- #36: settings content lives in its own component; the modal
             chrome (backdrop, focus trap, Esc, actions) is shared here. -->
        <SettingsDialog v-if="current.kind === 'settings'" />
        <!-- #6: picking an option submits immediately; cancel stays in
             the actions row below. -->
        <div v-if="current.kind === 'select'" class="app-dialog-options" role="listbox" :aria-label="current.title">
          <button
            v-for="option in current.options"
            :key="option.value"
            type="button"
            role="option"
            class="app-dialog-option"
            @click="onChoose(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="app-dialog-actions">
        <button
          type="button"
          class="app-dialog-btn app-dialog-btn--ghost"
          @click="onCancel"
        >
          {{ current.cancelLabel }}
        </button>
        <button
          v-if="current.kind !== 'select'"
          ref="submitButton"
          type="button"
          class="app-dialog-btn"
          :class="current.danger ? 'app-dialog-btn--danger' : 'app-dialog-btn--primary'"
          @click="onSubmit"
        >
          {{ current.submitLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, nextTick } from 'vue';
import SettingsDialog from './SettingsDialog.vue';
import {
  dialogService,
  validatePromptInput,
  type DialogHostListener,
  type DialogRequest,
} from '../ui/dialog';

/** Elements the focus trap may land on, in tab order. */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default defineComponent({
  name: 'AppDialog',
  components: { SettingsDialog },
  data() {
    return {
      /** Mirror of the service's current request; `null` when idle. */
      current: null as DialogRequest | null,
      /** Raw prompt input (untrimmed; the service owns normalisation). */
      inputValue: '',
      /** Inline validation message for a rejected prompt submission. */
      error: '' as string,
      /** Element focused before the dialog opened, restored on close. */
      returnFocusTo: null as Element | null,
      /** Registered service listener (kept so it can be unregistered). */
      onDialogRequest: null as DialogHostListener | null,
    };
  },
  mounted() {
    this.onDialogRequest = (request) => {
      this.current = request;
      if (request === null) {
        this.restoreFocus();
        return;
      }
      this.inputValue = request.initialValue;
      this.error = '';
      void nextTick(() => this.moveFocusIn());
    };
    dialogService.registerHost(this.onDialogRequest);
  },
  beforeUnmount() {
    if (this.onDialogRequest) {
      dialogService.unregisterHost(this.onDialogRequest);
      this.onDialogRequest = null;
    }
    this.restoreFocus();
  },
  methods: {
    /** Focus the input (prompt) or the primary button (confirm). */
    moveFocusIn() {
      const input = this.$refs.input as HTMLInputElement | undefined;
      if (input) {
        input.focus();
        input.select();
        return;
      }
      const submit = this.$refs.submitButton as HTMLButtonElement | undefined;
      submit?.focus();
    },

    /** Return focus to whatever had it before the dialog opened. */
    restoreFocus() {
      const target = this.returnFocusTo;
      this.returnFocusTo = null;
      if (target instanceof HTMLElement) {
        target.focus();
      }
    },

    rememberFocus() {
      const active = document.activeElement;
      this.returnFocusTo = active instanceof HTMLElement ? active : null;
    },

    onCancel() {
      dialogService.cancel();
    },

    /** #6: a select option was picked; submit it to the service. */
    onChoose(value: string) {
      dialogService.submitSelect(value);
    },

    onSubmit() {
      const request = this.current;
      if (request == null) return;
      if (request.kind === 'settings') {
        dialogService.closeSettings();
        return;
      }
      if (request.kind === 'confirm') {
        dialogService.submitConfirm(true);
        return;
      }
      // Show the same message the service validates against, and keep the
      // dialog open when the input is rejected.
      this.error = validatePromptInput(this.inputValue, request.allowEmpty) ?? '';
      dialogService.submitPrompt(this.inputValue);
    },

    onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.onCancel();
        return;
      }
      if (event.key === 'Enter' && this.current?.kind === 'confirm') {
        event.preventDefault();
        this.onSubmit();
        return;
      }
      if (event.key === 'Tab') {
        this.trapFocus(event);
      }
    },

    /** Keep Tab cycling inside the dialog while it is open. */
    trapFocus(event: KeyboardEvent) {
      const root = this.$refs.dialog as HTMLElement | undefined;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && index === focusable.length - 1) {
        event.preventDefault();
        focusable[0].focus();
      }
    },
  },
  watch: {
    /** Capture the pre-dialog focus exactly once per open. */
    current(next: DialogRequest | null, prev: DialogRequest | null) {
      if (next !== null && prev === null) {
        this.rememberFocus();
      }
    },
  },
});
</script>

<style scoped>
/* ── Backdrop ───────────────────────────────────────────────────────
   Flat ink scrim (no blur/glass); the card stays the guide's white. */
.app-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--backdrop-scrim);
  font-family: var(--font-sans);
  color: var(--ink);
}

/* ── Card ───────────────────────────────────────────────────────────
   White, 1px hairline, 5px radius, guide-maximum shadow. */
.app-dialog {
  box-sizing: border-box;
  width: min(420px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-1);
  outline: none;
}

.app-dialog-header {
  padding: 16px 20px 0;
}

.app-dialog-title {
  margin: 0;
  font-size: var(--font-size-heading);
  font-weight: var(--font-weight-title);
  line-height: var(--line-height-title);
  color: var(--ink);
  text-align: left;
  overflow-wrap: break-word;
}

.app-dialog-body {
  padding: 8px 20px 4px;
}

.app-dialog--wide {
  width: min(560px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  /* #73: an obvious scrollbar, so scrollable content is never gated
     behind an invisible one. */
  scrollbar-width: thin;
  scrollbar-color: var(--hairline-strong) var(--surface-sunken);
  scrollbar-gutter: stable;
  border-radius: 6px;
}

.app-dialog--wide::-webkit-scrollbar { width: 10px; }
.app-dialog--wide::-webkit-scrollbar-track { background: var(--surface-sunken); }
.app-dialog--wide::-webkit-scrollbar-thumb { background: var(--hairline-strong); border-radius: 5px; border: 2px solid var(--surface-sunken); }

.app-dialog-text {
  margin: 0 0 8px;
  font-size: var(--font-size-value);
  font-weight: 400;
  line-height: var(--line-height-body);
  color: var(--ink);
  opacity: 0.6;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  text-align: left;
  max-height: 30vh;
  overflow-y: auto;
}

.app-dialog-field {
  display: block;
  margin-top: 4px;
}

.app-dialog-label {
  display: block;
  font-size: var(--font-size-label);
  font-weight: 400;
  line-height: var(--line-height-body);
  color: var(--ink);
  opacity: 0.6;
  margin-bottom: 6px;
}

.app-dialog-input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  font-family: var(--font-sans);
  font-size: var(--font-size-value);
  font-weight: 400;
  line-height: var(--line-height-body);
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-control);
  outline: none;
}

.app-dialog-input:focus {
  border-color: var(--accent-steel);
  box-shadow: 0 0 0 1px var(--accent-steel);
}

.app-dialog-input--mono {
  font-family: var(--font-mono);
  font-size: var(--font-size-literal);
}

.app-dialog-error {
  margin: 6px 0 0;
  font-size: var(--font-size-meta);
  font-weight: 400;
  line-height: var(--line-height-body);
  color: var(--error);
}

.app-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
}

.app-dialog-btn {
  height: 28px;
  padding: 0 12px;
  font-family: var(--font-sans);
  font-size: var(--font-size-label);
  font-weight: var(--font-weight-section);
  line-height: var(--line-height-body);
  border-radius: var(--radius-control);
  border: 1px solid var(--hairline);
  background: var(--surface-panel);
  color: var(--ink);
  cursor: pointer;
  box-sizing: border-box;
}

.app-dialog-btn:hover {
  border-color: var(--hairline-strong);
}

.app-dialog-btn:focus-visible {
  outline: 2px solid var(--accent-steel);
  outline-offset: 1px;
}

/* Ghost/flat by default; the steel-blue fill is the single primary action. */
.app-dialog-btn--ghost {
  background: var(--surface-panel);
  color: var(--ink);
  opacity: 0.6;
  font-weight: 400;
}

.app-dialog-btn--ghost:hover {
  opacity: 1;
}

.app-dialog-btn--primary {
  background: var(--accent-steel);
  border-color: var(--accent-steel);
  color: var(--on-steel);
}

.app-dialog-btn--primary:hover {
  border-color: var(--accent-steel);
  filter: brightness(1.08);
}

/* Destructive primary (overwrites) uses the guide's error accent. */
.app-dialog-btn--danger {
  background: var(--error);
  border-color: var(--error);
  color: var(--on-steel);
}

.app-dialog-btn--danger:hover {
  border-color: var(--error);
  filter: brightness(1.08);
}

/* ── Select options (#6) ──────────────────────────────────────────
   Flat listbox rows on the surface; hairline separators, 13px values,
   steel blue reserved for hover/focus. No fills beyond the guide. */
.app-dialog-options {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
  max-height: 40vh;
  overflow-y: auto;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-control);
}

.app-dialog-option {
  padding: 8px 12px;
  font-family: var(--font-sans);
  font-size: var(--font-size-value);
  font-weight: 400;
  line-height: var(--line-height-body);
  color: var(--ink);
  text-align: left;
  background: var(--surface);
  border: none;
  border-bottom: 1px solid var(--hairline);
  cursor: pointer;
  box-sizing: border-box;
}

.app-dialog-option:last-child {
  border-bottom: none;
}

.app-dialog-option:hover {
  background: var(--surface-panel);
}

.app-dialog-option:focus-visible {
  outline: 2px solid var(--accent-steel);
  outline-offset: -2px;
}
</style>
