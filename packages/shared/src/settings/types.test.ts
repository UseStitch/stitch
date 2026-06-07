import { describe, expect, test } from 'bun:test';

import { SETTINGS_SCHEMAS, SETTINGS_DEFAULTS, isValidLeaderKeyHotkey } from './types';

describe('SETTINGS_DEFAULTS integrity', () => {
  test('every non-empty default value parses successfully against its schema', () => {
    for (const def of SETTINGS_DEFAULTS) {
      if (def.value === '') continue;

      const schema = SETTINGS_SCHEMAS[def.key];
      const result = schema.safeParse(def.value);
      if (!result.success) {
        throw new Error(
          `Default for "${def.key}" ("${def.value}") failed validation: ${result.error.message}`,
        );
      }
    }
  });
});

describe('isValidLeaderKeyHotkey', () => {
  test('accepts Mod+single letter', () => {
    expect(isValidLeaderKeyHotkey('Mod+X')).toBe(true);
    expect(isValidLeaderKeyHotkey('Mod+a')).toBe(true);
  });

  test('accepts Mod+single digit', () => {
    expect(isValidLeaderKeyHotkey('Mod+7')).toBe(true);
    expect(isValidLeaderKeyHotkey('Mod+0')).toBe(true);
  });

  test('rejects missing Mod prefix', () => {
    expect(isValidLeaderKeyHotkey('X')).toBe(false);
    expect(isValidLeaderKeyHotkey('Alt+X')).toBe(false);
  });

  test('rejects multi-key combos', () => {
    expect(isValidLeaderKeyHotkey('Mod+Shift+X')).toBe(false);
  });

  test('rejects named keys', () => {
    expect(isValidLeaderKeyHotkey('Mod+Tab')).toBe(false);
    expect(isValidLeaderKeyHotkey('Mod+Enter')).toBe(false);
  });

  test('rejects empty character', () => {
    expect(isValidLeaderKeyHotkey('Mod+')).toBe(false);
  });
});
