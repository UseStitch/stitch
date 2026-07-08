import { describe, expect, test } from 'bun:test';

import { SETTINGS_SCHEMAS, isValidLeaderKeyHotkey } from './types';

describe('SETTINGS_SCHEMAS', () => {
  test('parses boolean setting strings', () => {
    expect(SETTINGS_SCHEMAS['recordings.autoAnalyze'].parse('true')).toBe(true);
    expect(SETTINGS_SCHEMAS['recordings.autoAnalyze'].parse('false')).toBe(false);
    expect(SETTINGS_SCHEMAS['mail.alwaysLoadRemoteImages'].parse('true')).toBe(true);
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
