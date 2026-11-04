import { describe, it, expect, beforeEach } from 'vitest';
import {
  COMMANDS,
  DEFAULT_BINDINGS,
  DEFAULT_PREFERENCES,
  EDITOR_SETTINGS_KEY,
  OMITTED_COMMANDS,
  EditorSettingsStore,
  applyCanvasPreferences,
  matchCommand,
  normalizeCombo,
  parseCombo,
  validateSnapGridSize,
} from '../editorSettings';
import { MemoryStorage } from '../../onshape-utils/featurestudiotarget';
import { dialogService } from '../dialog';

function freshStore() {
  const storage = new MemoryStorage();
  return { storage, store: new EditorSettingsStore(storage) };
}

describe('editorSettings: preference defaults', () => {
  it('ships the audited defaults (grid on, snap on, 20px, Control/Shift)', () => {
    const { store } = freshStore();
    expect(store.getPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES).toEqual({
      showGrid: true,
      snapEnabled: true,
      snapGridSize: 20,
      snapModifier: 'Control',
      accumulateModifier: 'Shift',
    });
  });

  it('snap grid size validation accepts only 4–80 whole pixels', () => {
    expect(validateSnapGridSize(20)).toBe(20);
    expect(validateSnapGridSize('8')).toBe(8);
    expect(validateSnapGridSize(3)).toBeNull();
    expect(validateSnapGridSize(81)).toBeNull();
    expect(validateSnapGridSize(Number.NaN)).toBeNull();
    expect(validateSnapGridSize('nope')).toBeNull();
  });

  it('rejects an out-of-range snap size without persisting it', () => {
    const { storage, store } = freshStore();
    expect(store.setPreference('snapGridSize', 500)).toBe(false);
    expect(store.getPreferences().snapGridSize).toBe(20);
    expect(storage.getItem(EDITOR_SETTINGS_KEY)).toBeNull();
  });

  it('rejects making the two canvas modifiers identical', () => {
    const { store } = freshStore();
    expect(store.setPreference('accumulateModifier', 'Control')).toBe(false);
    expect(store.getPreferences().accumulateModifier).toBe('Shift');
  });
});

describe('editorSettings: persistence', () => {
  it('preferences survive a reload (new store, same storage)', () => {
    const { storage, store } = freshStore();
    store.setPreference('showGrid', false);
    store.setPreference('snapEnabled', false);
    store.setPreference('snapGridSize', 12);
    store.setPreference('snapModifier', 'Alt');
    const reloaded = new EditorSettingsStore(storage);
    expect(reloaded.getPreferences()).toEqual({
      showGrid: false,
      snapEnabled: false,
      snapGridSize: 12,
      snapModifier: 'Alt',
      accumulateModifier: 'Shift',
    });
  });

  it('falls back to defaults on corrupt JSON instead of throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(EDITOR_SETTINGS_KEY, '{not json');
    const store = new EditorSettingsStore(storage);
    expect(store.getPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(store.getBindings()).toEqual(DEFAULT_BINDINGS);
  });

  it('ignores unknown/partial persisted fields, keeping defaults for the rest', () => {
    const storage = new MemoryStorage();
    storage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify({
      preferences: { showGrid: false, snapGridSize: 9999, stray: true },
      bindings: { build: 'F9', bogusCommand: 'Ctrl+X' },
    }));
    const store = new EditorSettingsStore(storage);
    expect(store.getPreferences().showGrid).toBe(false);
    expect(store.getPreferences().snapGridSize).toBe(20);
    expect(store.getBindings().build).toBe('F9');
  });

  it('resetAll restores defaults and persists them', () => {
    const { storage, store } = freshStore();
    store.setPreference('showGrid', false);
    store.setBinding('build', 'F9');
    store.resetAll();
    expect(store.getPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(new EditorSettingsStore(storage).getBindings()).toEqual(DEFAULT_BINDINGS);
  });
});

describe('editorSettings: shortcut registry', () => {
  it('lists exactly the six implemented commands, each with a unique default', () => {
    expect(COMMANDS.map((c) => c.id)).toEqual(['build', 'run', 'upload', 'settings', 'fitView', 'deleteSelected']);
    expect(new Set(Object.values(DEFAULT_BINDINGS)).size).toBe(COMMANDS.length);
  });

  it('never lists Save/Open/Search as shortcuts (they are still no-ops)', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(ids).not.toContain('save');
    expect(ids).not.toContain('open');
    expect(ids).not.toContain('search');
    expect(OMITTED_COMMANDS.map((o) => o.label)).toEqual(['Save file', 'Open file', 'Search']);
  });

  it('rebinds a command and persists the new binding across reload', () => {
    const { storage, store } = freshStore();
    expect(store.setBinding('build', 'Ctrl+Shift+B')).toEqual({ ok: true });
    expect(store.getBinding('build')).toBe('Ctrl+Shift+B');
    expect(new EditorSettingsStore(storage).getBinding('build')).toBe('Ctrl+Shift+B');
  });

  it('rejects a binding that conflicts with another command, without changing anything', () => {
    const { store } = freshStore();
    const result = store.setBinding('build', DEFAULT_BINDINGS.run);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Run');
    expect(store.getBinding('build')).toBe(DEFAULT_BINDINGS.build);
  });

  it('rejects modifier-only and malformed combos', () => {
    const { store } = freshStore();
    expect(store.setBinding('build', 'Ctrl').ok).toBe(false);
    expect(store.setBinding('build', '').ok).toBe(false);
    expect(store.setBinding('build', 'Bogus+B').ok).toBe(false);
    expect(store.getBinding('build')).toBe(DEFAULT_BINDINGS.build);
  });

  it('allows binding a command to its own current combo (no false conflict)', () => {
    const { store } = freshStore();
    expect(store.setBinding('build', DEFAULT_BINDINGS.build)).toEqual({ ok: true });
  });

  it('resetBinding restores only that command', () => {
    const { store } = freshStore();
    store.setBinding('build', 'F9');
    store.setBinding('run', 'F8');
    store.resetBinding('build');
    expect(store.getBinding('build')).toBe(DEFAULT_BINDINGS.build);
    expect(store.getBinding('run')).toBe('F8');
  });

  it('never persists a conflicting pair from hand-edited storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify({
      bindings: { build: 'Ctrl+K', run: 'Ctrl+K', upload: 'Ctrl+Shift+U' },
    }));
    const store = new EditorSettingsStore(storage);
    expect(store.getBinding('build')).toBe('Ctrl+K');
    expect(store.getBinding('run')).toBe(DEFAULT_BINDINGS.run);
  });
});

describe('editorSettings: combo normalisation and matching', () => {
  it('normalises events to canonical combos', () => {
    expect(normalizeCombo({ key: 'b', ctrlKey: true })).toBe('Ctrl+B');
    expect(normalizeCombo({ key: 'B', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+B');
    expect(normalizeCombo({ key: 'Enter', ctrlKey: true })).toBe('Ctrl+Enter');
    expect(normalizeCombo({ key: 'Delete' })).toBe('Delete');
    expect(normalizeCombo({ key: ',', ctrlKey: true })).toBe('Ctrl+,');
    expect(normalizeCombo({ key: '0', ctrlKey: true })).toBe('Ctrl+0');
    expect(normalizeCombo({ key: 'Control', ctrlKey: true })).toBeNull();
    expect(normalizeCombo({ key: 'Unidentified' })).toBeNull();
  });

  it('parseCombo round-trips the canonical forms', () => {
    expect(parseCombo('Ctrl+Shift+B')).toEqual({ modifiers: ['Ctrl', 'Shift'], key: 'B' });
    expect(parseCombo('Delete')).toEqual({ modifiers: [], key: 'Delete' });
    expect(parseCombo('Control')).toBeNull();
    expect(parseCombo('')).toBeNull();
  });

  it('matchCommand dispatches real events and ignores typing targets', () => {
    const bindings = { ...DEFAULT_BINDINGS };
    expect(matchCommand({ key: 'b', ctrlKey: true }, null, bindings)).toBe('build');
    expect(matchCommand({ key: 'Delete' }, null, bindings)).toBe('deleteSelected');
    expect(matchCommand({ key: 'x', ctrlKey: true }, null, bindings)).toBeNull();
    expect(matchCommand({ key: 'b', ctrlKey: true }, { tagName: 'INPUT' }, bindings)).toBeNull();
    expect(matchCommand({ key: 'b', ctrlKey: true }, { tagName: 'TEXTAREA' }, bindings)).toBeNull();
    expect(matchCommand({ key: 'b', ctrlKey: true }, { tagName: 'DIV', isContentEditable: true }, bindings)).toBeNull();
  });

  it('honours a rebound binding in matchCommand', () => {
    const { store } = freshStore();
    store.setBinding('fitView', 'Ctrl+Shift+F');
    expect(matchCommand({ key: 'f', ctrlKey: true, shiftKey: true }, null, store.getBindings())).toBe('fitView');
    expect(matchCommand({ key: '0', ctrlKey: true }, null, store.getBindings())).toBeNull();
  });
});

describe('editorSettings: canvas grid application', () => {
  function fakeDoc() {
    const els = [{ style: { display: '' } }, { style: { display: '' } }];
    return { els, doc: { querySelectorAll: (sel: string) => (sel === '.background' ? els : []) } };
  }

  it('hides and restores every .background element', () => {
    const { els, doc } = fakeDoc();
    applyCanvasPreferences(doc, { showGrid: false });
    expect(els.map((e) => e.style.display)).toEqual(['none', 'none']);
    applyCanvasPreferences(doc, { showGrid: true });
    expect(els.map((e) => e.style.display)).toEqual(['', '']);
  });
});

describe('dialog service: settings request', () => {
  it('openSettings queues a settings request and closeSettings settles it', async () => {
    const seen: unknown[] = [];
    const host = (r: unknown) => { seen.push(r); };
    dialogService.registerHost(host as never);
    const pending = dialogService.openSettings();
    expect(dialogService.current?.kind).toBe('settings');
    expect(dialogService.current?.title).toBe('Settings');
    expect(dialogService.closeSettings()).toBe(true);
    await expect(pending).resolves.toBeUndefined();
    dialogService.unregisterHost(host as never);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('closeSettings refuses to close a prompt/confirm dialog', async () => {
    const host = () => {};
    dialogService.registerHost(host);
    const pending = dialogService.promptText({ title: 'T', label: 'L', initialValue: '' });
    expect(dialogService.closeSettings()).toBe(false);
    expect(dialogService.current?.kind).toBe('prompt');
    dialogService.cancel();
    await expect(pending).resolves.toBeNull();
    dialogService.unregisterHost(host);
  });
});
