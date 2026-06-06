import { describe, expect, test } from 'bun:test';

import { DEFAULT_TOOLSET_SETTINGS, parseToolsetSettings } from '@/tools/toolsets/settings.js';

describe('parseToolsetSettings', () => {
  test('returns safe defaults when unset', () => {
    expect(parseToolsetSettings(new Map())).toEqual(DEFAULT_TOOLSET_SETTINGS);
  });

  test('parses default scope and ttl turns', () => {
    expect(
      parseToolsetSettings(
        new Map([
          ['toolsets.defaultScope', 'current_run'],
          ['toolsets.ttlTurns', '5'],
        ]),
      ),
    ).toEqual({ defaultScope: 'current_run', ttlTurns: 5 });
  });

  test('ignores invalid values', () => {
    expect(
      parseToolsetSettings(
        new Map([
          ['toolsets.defaultScope', 'invalid'],
          ['toolsets.ttlTurns', '0'],
        ]),
      ),
    ).toEqual(DEFAULT_TOOLSET_SETTINGS);
  });
});
