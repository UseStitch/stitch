import { validateHotkey, type Hotkey, type HotkeySequence } from '@tanstack/react-hotkeys';

/**
 * Runtime strings from the shortcuts API / settings store are `string | null`.
 * `Hotkey` is a strict template-literal union, so plain strings are not
 * assignable. Validate at the boundary and fall back to a known-good default
 * instead of passing unvalidated strings through.
 */
export function toValidHotkey(value: string | null | undefined, fallback: Hotkey): Hotkey {
  if (!value) return fallback;
  if (!validateHotkey(value).valid) return fallback;
  // SAFETY: validateHotkey above confirms the runtime string matches the Hotkey grammar.
  return value as Hotkey;
}

export function toValidHotkeySequence(values: (string | null | undefined)[], fallback: HotkeySequence): HotkeySequence {
  if (values.length === 0) return fallback;
  const validated: Hotkey[] = [];
  for (const value of values) {
    if (!value || !validateHotkey(value).valid) return fallback;
    // SAFETY: validateHotkey above confirms each runtime string matches the Hotkey grammar.
    validated.push(value as Hotkey);
  }
  return validated;
}
