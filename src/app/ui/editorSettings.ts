/**
 * #36: editor preferences + keyboard-shortcut registry.
 *
 * Framework-free (no Vue, no DOM beyond an optional document for the grid
 * helper) so it can be unit tested with a `MemoryStorage` and read live by
 * the canvas (`rete/editorbase.ts`) without a reload.
 *
 * What is real here, audited against the code on master @ 47aa966:
 * - Canvas modifiers in `editorbase.ts`: holding Ctrl enables grid snap
 *   (`snapGrid(..., { allowed: () => checkKey('control') })`, size 20), and
 *   holding Shift accumulates the node selection
 *   (`AreaExtensions.selectableNodes(..., { accumulating: () => checkKey('Shift') })`).
 *   Those two hold-keys are modelled as rebinding-able modifiers below.
 * - Commands implemented in `App.vue`: Build (`runBuild`), Run (`runRun`),
 *   Upload (`runUpload`). Fit view and delete-selected are implemented by
 *   this issue in `editorbase.ts` (`AreaExtensions.zoomAt` over all nodes,
 *   `editor.removeNode` for the selected nodes) so they can be bound honestly.
 * - Save (`runSave`) and Open (`runOpen`) in `App.vue` are real, so they
 *   are listed like every other command. Search is the action palette
 *   (`actionPalette`, F3 — Blender's search-menu key); the old no-op
 *   `runSearch()` now opens it. `OMITTED_COMMANDS` is empty for the same
 *   reason: nothing is left unimplemented.
 *
 * Persistence uses the same storage layer as the deploy targets
 * (`browserStorage()` from `onshape-utils/featurestudiotarget.ts`, with a
 * `MemoryStorage` fallback), under one JSON key — not the app-element
 * `UserInfo` tree, which only resolves inside an embedded Onshape session.
 */

import {
    browserStorage,
    MemoryStorage,
    type SettingsStorage,
} from '../onshape-utils/featurestudiotarget';

export const EDITOR_SETTINGS_KEY = 'onshape-node-editor:editor-settings';

import type { DebugGridPreferences } from './debuggrid';
import {
    DEFAULT_DEBUG_GRID_PREFERENCES,
    sanitiseDebugGridPreferences,
    validateDebugGridPreference,
} from './debuggrid';

/** Hold-keys the canvas can listen for. `checkKey` names are mapped in editorbase. */
export const MODIFIER_KEYS = ['Control', 'Meta', 'Alt', 'Shift'] as const;
export type ModifierKey = (typeof MODIFIER_KEYS)[number];

export interface EditorPreferences {
    /** Show the canvas grid background (#16). Default: true. */
    showGrid: boolean;
    /** Allow Ctrl-(snap modifier)-gated grid snap while dragging. Default: true. */
    snapEnabled: boolean;
    /** Grid snap size in px, 4–80. Default: 20 (the size editorbase used). */
    snapGridSize: number;
    /** Hold-key that enables snapping while dragging. Default: Control. */
    snapModifier: ModifierKey;
    /** Hold-key that accumulates node selection. Default: Shift. */
    accumulateModifier: ModifierKey;
    /** #16: debug grid column visibility, error filter and sort. */
    debugGrid: DebugGridPreferences;
}

export const DEFAULT_PREFERENCES: EditorPreferences = {
    showGrid: true,
    snapEnabled: true,
    snapGridSize: 20,
    snapModifier: 'Control',
    accumulateModifier: 'Shift',
    debugGrid: DEFAULT_DEBUG_GRID_PREFERENCES,
};

export const SNAP_GRID_SIZE_MIN = 4;
export const SNAP_GRID_SIZE_MAX = 80;

export function validateSnapGridSize(value: unknown): number | null {
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    const rounded = Math.round(n);
    return rounded >= SNAP_GRID_SIZE_MIN && rounded <= SNAP_GRID_SIZE_MAX ? rounded : null;
}

/** A command the app actually honours, with its default binding. */
export type CommandId = 'build' | 'run' | 'upload' | 'save' | 'open' | 'settings' | 'fitView' | 'deleteSelected' | 'createFrame' | 'createGroup' | 'addNode' | 'debugGrid' | 'actionPalette';

export interface CommandDefinition {
    id: CommandId;
    label: string;
    description: string;
    defaultCombo: string;
}

export const COMMANDS: readonly CommandDefinition[] = [
    { id: 'build', label: 'Build', description: 'Compile and validate the current node graph.', defaultCombo: 'Ctrl+B' },
    { id: 'run', label: 'Run', description: 'Insert the generated feature into the Run target Part Studio.', defaultCombo: 'Ctrl+Enter' },
    { id: 'upload', label: 'Upload', description: 'Build the graph and write it to the Feature Studio target.', defaultCombo: 'Ctrl+Shift+U' },
    { id: 'save', label: 'Save', description: 'Save the open graph to its element.', defaultCombo: 'Ctrl+S' },
    { id: 'open', label: 'Open', description: 'Pick and load a saved graph.', defaultCombo: 'Ctrl+O' },
    { id: 'settings', label: 'Settings', description: 'Open this settings dialog.', defaultCombo: 'Ctrl+,' },
    { id: 'fitView', label: 'Fit view', description: 'Zoom the canvas to fit all nodes.', defaultCombo: 'Ctrl+0' },
    { id: 'deleteSelected', label: 'Delete selected nodes', description: 'Remove the currently selected nodes from the canvas.', defaultCombo: 'Delete' },
    { id: 'createFrame', label: 'Frame selected nodes', description: 'Wrap the selected nodes in a grouping frame (#13).', defaultCombo: 'Ctrl+G' },
    { id: 'createGroup', label: 'Create Group from Selection', description: 'Turn the selected nodes into a reusable node group; Tab enters it, Tab again exits.', defaultCombo: 'Ctrl+Shift+G' },
    { id: 'addNode', label: 'Add node', description: 'Open the catalog palette to add a node (#8).', defaultCombo: 'Ctrl+K' },
    { id: 'debugGrid', label: 'Debug grid', description: 'Toggle the debug grid (node-wrangler view of live values).', defaultCombo: 'Ctrl+D' },
    { id: 'actionPalette', label: 'Search actions', description: 'Open the action palette (Blender-style search menu).', defaultCombo: 'F3' },
];

/** Commands with no implementation yet — listed in the dialog so the omission is explicit, never bound. */
export const OMITTED_COMMANDS: readonly { label: string; reason: string }[] = [];

export type ShortcutBindings = Record<CommandId, string>;

export const DEFAULT_BINDINGS: ShortcutBindings = {
    build: 'Ctrl+B',
    run: 'Ctrl+Enter',
    upload: 'Ctrl+Shift+U',
    settings: 'Ctrl+,',
    fitView: 'Ctrl+0',
    deleteSelected: 'Delete',
    createFrame: 'Ctrl+G',
    createGroup: 'Ctrl+Shift+G',
    addNode: 'Ctrl+K',
    debugGrid: 'Ctrl+D',
    save: 'Ctrl+S',
    open: 'Ctrl+O',
    actionPalette: 'F3',
};

const MODIFIER_ORDER = ['Ctrl', 'Meta', 'Alt', 'Shift'] as const;

/** Canonicalise a KeyboardEvent-like object to e.g. `Ctrl+Shift+B`, `Delete`, `Ctrl+,`. */
export function normalizeCombo(event: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
}): string | null {
    const key = event.key;
    if (key == null || key === '' || key === 'Unidentified') return null;
    if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(key)) return null;
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.metaKey) parts.push('Meta');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey && key.length === 1 && /[a-zA-Z]/.test(key)) parts.push('Shift');
    else if (event.shiftKey && key.length > 1) parts.push('Shift');
    const main = key.length === 1 ? key.toUpperCase() : key;
    parts.push(main);
    return parts.join('+');
}

/** Parse a stored/recorded combo string back into its parts (inverse of normalizeCombo for our alphabet). */
export function parseCombo(combo: string): { modifiers: string[]; key: string } | null {
    if (typeof combo !== 'string' || combo.trim() === '') return null;
    const parts = combo.split('+').map((p) => p.trim()).filter((p) => p !== '');
    if (parts.length === 0) return null;
    const key = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);
    if (!modifiers.every((m) => (MODIFIER_ORDER as readonly string[]).includes(m))) return null;
    if (MODIFIER_KEYS.includes(key as ModifierKey) || key === 'CapsLock' || (MODIFIER_ORDER as readonly string[]).includes(key)) return null;
    return { modifiers, key };
}

export function isTypingTarget(target: unknown): boolean {
    if (target == null || typeof target !== 'object') return false;
    const el = target as { tagName?: string; isContentEditable?: boolean };
    if (el.isContentEditable === true) return true;
    const tag = (el.tagName ?? '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

export interface PersistedEditorSettings {
    preferences: EditorPreferences;
    bindings: ShortcutBindings;
}

function sanitisePreferences(raw: unknown): EditorPreferences {
    const prefs: EditorPreferences = { ...DEFAULT_PREFERENCES };
    if (raw == null || typeof raw !== 'object') return prefs;
    const r = raw as Partial<EditorPreferences>;
    if (typeof r.showGrid === 'boolean') prefs.showGrid = r.showGrid;
    if (typeof r.snapEnabled === 'boolean') prefs.snapEnabled = r.snapEnabled;
    const size = validateSnapGridSize(r.snapGridSize);
    if (size != null) prefs.snapGridSize = size;
    if (MODIFIER_KEYS.includes(r.snapModifier as ModifierKey)) prefs.snapModifier = r.snapModifier as ModifierKey;
    if (MODIFIER_KEYS.includes(r.accumulateModifier as ModifierKey)) prefs.accumulateModifier = r.accumulateModifier as ModifierKey;
    if (prefs.snapModifier === prefs.accumulateModifier) prefs.accumulateModifier = DEFAULT_PREFERENCES.accumulateModifier;
    prefs.debugGrid = sanitiseDebugGridPreferences(r.debugGrid);
    return prefs;
}

function sanitiseBindings(raw: unknown, base: ShortcutBindings): ShortcutBindings {
    const bindings: ShortcutBindings = { ...base };
    if (raw == null || typeof raw !== 'object') return bindings;
    const seen = new Map<string, CommandId>();
    for (const cmd of COMMANDS) {
        const value = (raw as Partial<Record<string, unknown>>)[cmd.id];
        if (typeof value !== 'string') continue;
        const parsed = parseCombo(value);
        if (parsed == null) continue;
        if (seen.has(value)) continue; // first writer wins; conflicts never persist
        seen.set(value, cmd.id);
        bindings[cmd.id] = value;
    }
    return bindings;
}

export type SetBindingResult = { ok: true } | { ok: false; error: string };

export class EditorSettingsStore {
    private readonly storage: SettingsStorage;
    private readonly key: string;
    private persisted: PersistedEditorSettings;

    constructor(storage: SettingsStorage = new MemoryStorage(), key: string = EDITOR_SETTINGS_KEY) {
        this.storage = storage;
        this.key = key;
        this.persisted = this.load();
    }

    private load(): PersistedEditorSettings {
        let raw: string | null = null;
        try {
            raw = this.storage.getItem(this.key);
        } catch {
            raw = null;
        }
        if (raw == null) return { preferences: { ...DEFAULT_PREFERENCES }, bindings: { ...DEFAULT_BINDINGS } };
        try {
            const parsed = JSON.parse(raw) as Partial<PersistedEditorSettings>;
            return {
                preferences: sanitisePreferences(parsed.preferences),
                bindings: sanitiseBindings(parsed.bindings, DEFAULT_BINDINGS),
            };
        } catch {
            return { preferences: { ...DEFAULT_PREFERENCES }, bindings: { ...DEFAULT_BINDINGS } };
        }
    }

    private save(): void {
        try {
            this.storage.setItem(this.key, JSON.stringify(this.persisted));
        } catch {
            // Storage may be unavailable (private mode); in-memory state still applies.
        }
    }

    getPreferences(): EditorPreferences {
        return {
            ...this.persisted.preferences,
            debugGrid: { ...this.persisted.preferences.debugGrid, columns: [...this.persisted.preferences.debugGrid.columns] },
        };
    }

    /** #16: update one debug-grid sub-preference, validating it. */
    setDebugGridPreference<K extends keyof DebugGridPreferences>(key: K, value: DebugGridPreferences[K]): boolean {
        const validated = validateDebugGridPreference(key, value);
        if (validated == null) return false;
        this.persisted.preferences.debugGrid = {
            ...this.persisted.preferences.debugGrid,
            [key]: validated,
        };
        this.save();
        return true;
    }

    getBindings(): ShortcutBindings {
        return { ...this.persisted.bindings };
    }

    getBinding(id: CommandId): string {
        return this.persisted.bindings[id];
    }

    /** Update one preference, validating it. Returns false (and does not save) on invalid input. */
    setPreference<K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]): boolean {
        if (key === 'showGrid' || key === 'snapEnabled') {
            if (typeof value !== 'boolean') return false;
        } else if (key === 'snapGridSize') {
            const size = validateSnapGridSize(value);
            if (size == null) return false;
            this.persisted.preferences.snapGridSize = size;
            this.save();
            return true;
        } else if (key === 'snapModifier' || key === 'accumulateModifier') {
            if (!MODIFIER_KEYS.includes(value as ModifierKey)) return false;
            const other = key === 'snapModifier' ? this.persisted.preferences.accumulateModifier : this.persisted.preferences.snapModifier;
            if (value === other) return false;
        }
        this.persisted.preferences[key] = value;
        this.save();
        return true;
    }

    /** Rebind a command, rejecting a combo already bound to another command. */
    setBinding(id: CommandId, combo: string): SetBindingResult {
        if (parseCombo(combo) == null) return { ok: false, error: `"${combo}" is not a usable shortcut.` };
        for (const cmd of COMMANDS) {
            if (cmd.id !== id && this.persisted.bindings[cmd.id] === combo) {
                return { ok: false, error: `${combo} is already bound to ${cmd.label}.` };
            }
        }
        this.persisted.bindings[id] = combo;
        this.save();
        return { ok: true };
    }

    resetBinding(id: CommandId): void {
        this.persisted.bindings[id] = DEFAULT_BINDINGS[id];
        this.save();
    }

    resetAll(): void {
        this.persisted = { preferences: { ...DEFAULT_PREFERENCES }, bindings: { ...DEFAULT_BINDINGS } };
        this.save();
    }

    clear(): void {
        this.persisted = { preferences: { ...DEFAULT_PREFERENCES }, bindings: { ...DEFAULT_BINDINGS } };
        try {
            this.storage.removeItem(this.key);
        } catch {
            // ignore
        }
    }
}

/** The one live store: browser storage when available, memory otherwise. */
export const editorSettings = new EditorSettingsStore(browserStorage() ?? new MemoryStorage());

/** Which command (if any) a keyboard event triggers, or null. Typing targets never match. */
export function matchCommand(
    event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean },
    target: unknown,
    bindings: ShortcutBindings,
): CommandId | null {
    if (isTypingTarget(target)) return null;
    const combo = normalizeCombo(event);
    if (combo == null) return null;
    for (const cmd of COMMANDS) {
        if (bindings[cmd.id] === combo) return cmd.id;
    }
    return null;
}

export interface CanvasDocumentLike {
    querySelectorAll(selector: string): ArrayLike<{ style: { display: string } }>;
}

/** Show/hide the grid background element created by `addCustomBackground`. Testable without a real DOM. */
export function applyCanvasPreferences(doc: CanvasDocumentLike, prefs: Pick<EditorPreferences, 'showGrid'>): void {
    const elements = doc.querySelectorAll('.background');
    for (let i = 0; i < elements.length; i++) {
        elements[i].style.display = prefs.showGrid ? '' : 'none';
    }
}
