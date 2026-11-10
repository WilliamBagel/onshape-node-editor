/**
 * Selection-accumulation modifiers.
 *
 * Clicking a node with a modifier adds it to the current selection instead of
 * replacing it (rete's `AreaExtensions.selectableNodes` asks `accumulating`
 * on every pick). The configured modifier is user-rebindable
 * (`EditorPreferences.accumulateModifier`, Shift by default), and Control /
 * Meta are always additive as well: Ctrl-click and Cmd-click are the platform
 * gestures users reach for first, so they must not silently replace the
 * selection when the setting points at another key.
 *
 * Kept framework- and rete-free so the rule is unit-testable without booting
 * a canvas.
 */

/** Map a settings modifier name to the name `@rwh/keystrokes` `checkKey` tracks. */
export function modifierCheckKey(modifier: string): string {
    switch (modifier) {
        case 'Control': return 'control';
        case 'Shift': return 'Shift';
        case 'Meta': return 'meta';
        case 'Alt': return 'alt';
        default: return modifier;
    }
}

/**
 * True when a pick should add to the existing selection.
 *
 * @param isPressed `@rwh/keystrokes`-style predicate over currently-held keys.
 * @param configuredModifier the user's `accumulateModifier` preference.
 */
export function isAccumulateHeld(
    isPressed: (key: string) => boolean,
    configuredModifier: string
): boolean {
    return isPressed('control') || isPressed('meta') || isPressed(modifierCheckKey(configuredModifier));
}
