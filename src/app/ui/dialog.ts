/**
 * #34: promise-based, in-app dialog service.
 *
 * One module-level service backs every editor dialog (graph naming, Part
 * Studio target entry, overwrite/drift confirmation). A single host component
 * (`components/AppDialog.vue`, mounted once in `App.vue`) registers itself and
 * renders the service's current request; every caller just awaits a promise.
 *
 * The service itself is framework-free (no Vue, no DOM) so `app.ts` can route
 * its injected confirm seams through it and unit tests can drive it with a
 * plain-listener fake host. Focus management, keyboard handling and styling
 * live in the host component; this module owns the queue, the request shapes
 * and the input validation rules.
 *
 * Cancellation semantics mirror the browser defaults they replace:
 * `promptText()` resolves `null` on cancel, `confirm()` resolves `false`.
 * Empty text is never a valid submission (unless `allowEmpty` is set), which
 * preserves the old `name == null || name.trim() === ''` rejection exactly.
 */

export type DialogKind = 'prompt' | 'confirm' | 'settings';

export interface PromptTextOptions {
  /** Dialog heading, 14px/600. */
  title: string;
  /** Field label, 12px. */
  label?: string;
  /** Longer explanation rendered above the field, 13px. */
  body?: string;
  /** Pre-filled value; the old `browser prompt` default argument. */
  initialValue?: string;
  /** Primary button text. Defaults to 'OK'. */
  submitLabel?: string;
  /** Secondary (cancel) button text. Defaults to 'Cancel'. */
  cancelLabel?: string;
  /** When false (default), blank/whitespace-only input cannot submit. */
  allowEmpty?: boolean;
  /** Render the input in the 12px monospace literal-value face. */
  mono?: boolean;
  placeholder?: string;
}

export interface ConfirmOptions {
  /** Dialog heading, 14px/600. */
  title: string;
  /** Message/diff shown to the user, 13px. */
  body?: string;
  /** Primary button text. Defaults to 'OK'. */
  confirmLabel?: string;
  /** Secondary (cancel) button text. Defaults to 'Cancel'. */
  cancelLabel?: string;
  /** Colour the primary button with the error accent (destructive writes). */
  danger?: boolean;
}

export interface DialogRequest {
  id: number;
  kind: DialogKind;
  title: string;
  body?: string;
  label?: string;
  initialValue: string;
  submitLabel: string;
  cancelLabel: string;
  danger: boolean;
  allowEmpty: boolean;
  mono: boolean;
  placeholder?: string;
  /** Internal: resolves the promise returned to the caller. */
  settle: (result: string | boolean | null) => void;
}

/** Host components receive the current request (or `null`) on every change. */
export type DialogHostListener = (request: DialogRequest | null) => void;

/**
 * Normalise raw input the way the old `browser prompt` call sites did:
 * the returned name/target is trimmed, and blank input counts as cancelled.
 * Returns the trimmed value, or `null` when it is empty.
 */
export function trimPromptValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Validate a prompt submission. Returns an error message to show inline, or
 * `null` when the value may be submitted. Blank input is rejected unless
 * `allowEmpty` is set — the same rule the `browser prompt` sites applied after
 * the fact, now enforced before the dialog can close.
 */
export function validatePromptInput(value: string, allowEmpty = false): string | null {
  if (value.trim() === '') {
    return allowEmpty ? null : 'Enter a value to continue.';
  }
  return null;
}

/** The value `confirm()` resolves with when the user cancels. */
export const CONFIRM_CANCELLED = false;

export class DialogService {
  private queue: DialogRequest[] = [];
  private nextId = 1;
  private listener: DialogHostListener | null = null;

  /** The request currently shown to the user, or `null`. */
  current: DialogRequest | null = null;

  /** Attach the one host component; it is called immediately with the current state. */
  registerHost(listener: DialogHostListener): void {
    this.listener = listener;
    listener(this.current);
  }

  unregisterHost(listener: DialogHostListener): void {
    if (this.listener === listener) {
      this.listener = null;
    }
  }

  /** Ask for a line of text. Resolves the trimmed string, or `null` on cancel. */
  promptText(options: PromptTextOptions): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.enqueue({
        id: this.nextId++,
        kind: 'prompt',
        title: options.title,
        body: options.body,
        label: options.label,
        initialValue: options.initialValue ?? '',
        submitLabel: options.submitLabel ?? 'OK',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        danger: false,
        allowEmpty: options.allowEmpty ?? false,
        mono: options.mono ?? false,
        placeholder: options.placeholder,
        settle: (result) => resolve(typeof result === 'string' ? result : null),
      });
    });
  }

  /** Ask for a yes/no confirmation. Resolves `true` only on explicit accept. */
  confirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.enqueue({
        id: this.nextId++,
        kind: 'confirm',
        title: options.title,
        body: options.body,
        initialValue: '',
        submitLabel: options.confirmLabel ?? 'OK',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        danger: options.danger ?? false,
        allowEmpty: true,
        mono: false,
        settle: (result) => resolve(result === true),
      });
    });
  }

  /** Open the #36 settings dialog (AppDialog renders it as the wide variant). Resolves when closed. */
  openSettings(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.enqueue({
        id: this.nextId++,
        kind: 'settings',
        title: 'Settings',
        initialValue: '',
        submitLabel: 'Done',
        cancelLabel: 'Cancel',
        danger: false,
        allowEmpty: true,
        mono: false,
        settle: () => resolve(),
      });
    });
  }

  /** Close the settings dialog (the host's Done/Cancel buttons). */
  closeSettings(): boolean {
    const request = this.current;
    if (request == null || request.kind !== 'settings') return false;
    this.dismiss(null);
    return true;
  }

  /**
   * Submit the current prompt with raw input. Trims it, enforces the
   * empty-value rule, and dismisses on success. Returns `true` when the
   * dialog was dismissed (caller may close), `false` when validation kept it
   * open. A no-op returning `false` when no dialog is showing.
   */
  submitPrompt(rawValue: string): boolean {
    const request = this.current;
    if (request == null || request.kind !== 'prompt') return false;
    if (validatePromptInput(rawValue, request.allowEmpty) !== null) return false;
    const value = request.allowEmpty ? rawValue.trim() : trimPromptValue(rawValue);
    this.dismiss(value);
    return true;
  }

  /** Submit the current confirmation with an explicit accept/refuse. */
  submitConfirm(accepted: boolean): boolean {
    const request = this.current;
    if (request == null || request.kind !== 'confirm') return false;
    this.dismiss(accepted);
    return true;
  }

  /** Cancel whatever is showing, with the kind-appropriate cancelled value. */
  cancel(): boolean {
    const request = this.current;
    if (request == null) return false;
    this.dismiss(request.kind === 'confirm' ? CONFIRM_CANCELLED : null);
    return true;
  }

  private enqueue(request: DialogRequest): void {
    if (this.current == null) {
      this.show(request);
    } else {
      this.queue.push(request);
    }
  }

  private show(request: DialogRequest): void {
    this.current = request;
    this.listener?.(request);
  }

  private dismiss(result: string | boolean | null): void {
    const request = this.current;
    if (request == null) return;
    this.current = this.queue.shift() ?? null;
    request.settle(result);
    this.listener?.(this.current);
  }
}

/** The one service instance; `AppDialog.vue` is its only host. */
export const dialogService = new DialogService();

/** Module-level convenience: `const name = await promptText({ title, initialValue })`. */
export function promptText(options: PromptTextOptions): Promise<string | null> {
  return dialogService.promptText(options);
}

/** Module-level convenience: `const ok = await confirm({ title, body, danger })`. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return dialogService.confirm(options);
}
