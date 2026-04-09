import { describe, expect, test } from 'vitest';

import { internal } from './windows.js';

const describeWindows = process.platform === 'win32' ? describe : describe.skip;

describeWindows('windows meeting detector parser', () => {
  test('parses json rows', () => {
    const rows = internal.parseRows('[{"pid":100,"processName":"msedge","windowTitle":"Google Meet"}]');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pid: 100, processName: 'msedge', windowTitle: 'Google Meet' });
  });

  test('classifies google meet browser windows', () => {
    const observations = internal.classifyRow({
      processName: 'chrome.exe',
      windowTitle: 'Daily Standup - Google Meet',
    });

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'browser:google-meet:chrome',
          platform: 'google-meet',
          kind: 'browser',
          displayName: 'Google Meet',
        }),
      ]),
    );
  });

  test('does not classify browser window when title is not meet', () => {
    const observations = internal.classifyRow({
      processName: 'msedge',
      windowTitle: 'Inbox - Outlook',
    });

    expect(observations.some((observation) => observation.platform === 'google-meet')).toBe(false);
  });
});
