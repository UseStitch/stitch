import { describe, expect, test } from 'vitest';

import { SETTINGS_KEYS, isValidLeaderKeyHotkey } from '@stitch/shared/settings/types';

describe('settings type helpers', () => {
  test('includes onboarding/profile keys used by onboarding flow', () => {
    expect(SETTINGS_KEYS).toContain('profile.name');
    expect(SETTINGS_KEYS).toContain('profile.timezone');
    expect(SETTINGS_KEYS).toContain('onboarding.version');
  });

  test('accepts Mod+single character leader keys', () => {
    expect(isValidLeaderKeyHotkey('Mod+X')).toBe(true);
    expect(isValidLeaderKeyHotkey('Mod+a')).toBe(true);
    expect(isValidLeaderKeyHotkey('Mod+7')).toBe(true);
  });

  test('rejects leader keys outside Mod+<single letter or digit>', () => {
    expect(isValidLeaderKeyHotkey('X')).toBe(false);
    expect(isValidLeaderKeyHotkey('Alt+X')).toBe(false);
    expect(isValidLeaderKeyHotkey('Mod+Shift+X')).toBe(false);
    expect(isValidLeaderKeyHotkey('Mod+Tab')).toBe(false);
    expect(isValidLeaderKeyHotkey('Mod+')).toBe(false);
  });
});
