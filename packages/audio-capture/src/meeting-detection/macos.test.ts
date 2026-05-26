import { describe, expect, test } from 'bun:test';

import { internal } from './macos.js';

const describeMac = process.platform === 'darwin' ? describe : describe.skip;

describeMac('macos meeting detector parser', () => {
  test('parses json rows', () => {
    const rows = internal.parseRows('[{"pid":123,"processName":"zoom.us","windowTitle":null}]');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pid: 123, processName: 'zoom.us' });
  });

  test('maps known process names to desktop observations', () => {
    expect(internal.toDesktopObservation({ processName: 'Slack' })).toMatchObject({
      key: 'desktop:slack',
      platform: 'slack',
      kind: 'desktop',
      displayName: 'Slack',
      processNames: ['Slack'],
    });

    expect(internal.toDesktopObservation({ processName: 'Microsoft Teams Helper' })).toMatchObject({
      key: 'desktop:teams',
      platform: 'teams',
      kind: 'desktop',
      displayName: 'Microsoft Teams',
    });
  });

  test('maps browser process and title to google meet observation', () => {
    const observation = internal.toBrowserObservation({
      processName: 'Google Chrome',
      windowTitle: 'Google Meet - Standup',
    });

    expect(observation).toMatchObject({
      key: 'browser:google-meet:chrome',
      platform: 'google-meet',
      kind: 'browser',
      displayName: 'Google Meet',
      windowTitle: 'Google Meet - Standup',
    });
  });

  test('returns null for unknown process names and non-meet titles', () => {
    expect(internal.toDesktopObservation({ processName: 'Finder' })).toBeNull();
    expect(
      internal.toBrowserObservation({
        processName: 'Google Chrome',
        windowTitle: 'Inbox - Gmail',
      }),
    ).toBeNull();
  });
});
