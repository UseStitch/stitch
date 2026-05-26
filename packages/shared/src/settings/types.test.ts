import { describe, expect, test } from 'bun:test';

import {
  SETTINGS_KEYS,
  SETTINGS_SCHEMAS,
  SETTINGS_DEFAULTS,
  isValidLeaderKeyHotkey,
} from './types';

describe('SETTINGS_KEYS integrity', () => {
  test('has no duplicate keys', () => {
    const unique = new Set(SETTINGS_KEYS);
    expect(unique.size).toBe(SETTINGS_KEYS.length);
  });

  test('every key has a corresponding schema', () => {
    for (const key of SETTINGS_KEYS) {
      expect(key in SETTINGS_SCHEMAS).toBe(true);
    }
  });

  test('schemas do not contain keys outside SETTINGS_KEYS', () => {
    const keySet = new Set<string>(SETTINGS_KEYS);
    for (const schemaKey of Object.keys(SETTINGS_SCHEMAS)) {
      expect(keySet.has(schemaKey)).toBe(true);
    }
  });
});

describe('SETTINGS_DEFAULTS integrity', () => {
  test('has no duplicate keys', () => {
    const keys = SETTINGS_DEFAULTS.map((d) => d.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  test('every default key exists in SETTINGS_KEYS', () => {
    const keySet = new Set<string>(SETTINGS_KEYS);
    for (const def of SETTINGS_DEFAULTS) {
      expect(keySet.has(def.key)).toBe(true);
    }
  });

  test('every non-empty default value parses successfully against its schema', () => {
    for (const def of SETTINGS_DEFAULTS) {
      // Empty string defaults are "unset" placeholders — skip validation
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
