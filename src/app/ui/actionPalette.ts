/**
 * #73: pure helpers for the Blender-style action palette (`ActionPalette.vue`).
 * Framework-free so the filtering, dispatch guard and shortcut are unit
 * tested without a DOM. The action list itself is the `COMMANDS` registry
 * in `editorSettings.ts` — labels and shortcuts stay one source of truth.
 */

import { COMMANDS, isTypingTarget, type CommandDefinition, type CommandId } from './editorSettings';

/** Shortcut that opens the action palette (Blender's search-menu key). */
export const ACTION_PALETTE_SHORTCUT = 'F3';

/** Every action the palette offers, driven by the command registry. */
export function paletteActions(): readonly CommandDefinition[] {
  return COMMANDS;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) { if (ch === needle[i]) i++; if (i >= needle.length) return true; }
  return needle.length === 0;
}

function scoreAction(action: CommandDefinition, tokens: readonly string[]): number | null {
  const label = action.label.toLowerCase();
  const description = action.description.toLowerCase();
  let total = 0;
  for (const token of tokens) {
    if (label.startsWith(token)) total += 100;
    else if (label.includes(token)) total += 60;
    else if (description.includes(token)) total += 20;
    else if (isSubsequence(token, label)) total += 10;
    else return null;
  }
  return total;
}

/** Fuzzy, ranked filter over the registry actions; an empty term returns all. */
export function filterActions(term: string): CommandDefinition[] {
  const tokens = term.trim().toLowerCase().split(/\s+/).filter((t) => t !== '');
  if (tokens.length === 0) return [...COMMANDS];
  return COMMANDS
    .map((action) => ({ action, score: scoreAction(action, tokens) }))
    .filter((r): r is { action: CommandDefinition; score: number } => r.score != null)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.action);
}

/**
 * Guard for dispatching an action programmatically (palette Enter/click):
 * actions never fire while a dialog is open or while the user is typing
 * in a text field.
 */
export function canDispatchAction(options: { dialogOpen: boolean; target?: unknown }): boolean {
  if (options.dialogOpen) return false;
  if (isTypingTarget(options.target)) return false;
  return true;
}

export type { CommandId };
