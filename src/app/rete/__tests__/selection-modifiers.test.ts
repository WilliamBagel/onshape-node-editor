import { describe, expect, it } from 'vitest';
import { isAccumulateHeld, modifierCheckKey } from '../selection-modifiers';

/** Build a keystroke predicate over a fixed set of held keys. */
function held(...keys: string[]) {
  return (key: string) => keys.includes(key.toLowerCase());
}

describe('selection modifiers', () => {
  it('maps settings modifier names to keystroke key names', () => {
    expect(modifierCheckKey('Control')).toBe('control');
    expect(modifierCheckKey('Shift')).toBe('Shift');
    expect(modifierCheckKey('Meta')).toBe('meta');
    expect(modifierCheckKey('Alt')).toBe('alt');
  });

  it('accumulates on the default Shift modifier', () => {
    expect(isAccumulateHeld(held('shift'), 'Shift')).toBe(true);
    expect(isAccumulateHeld(held(), 'Shift')).toBe(false);
  });

  it('accumulates on Control and Meta regardless of the configured modifier', () => {
    expect(isAccumulateHeld(held('control'), 'Shift')).toBe(true);
    expect(isAccumulateHeld(held('meta'), 'Shift')).toBe(true);
    expect(isAccumulateHeld(held('control'), 'Alt')).toBe(true);
    expect(isAccumulateHeld(held('meta'), 'Alt')).toBe(true);
  });

  it('honours a custom configured modifier', () => {
    expect(isAccumulateHeld(held('alt'), 'Alt')).toBe(true);
    // Shift is no longer the accumulate key once the preference moved to Alt.
    expect(isAccumulateHeld(held('shift'), 'Alt')).toBe(false);
  });
});
