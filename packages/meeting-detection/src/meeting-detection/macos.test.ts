import { describe, expect, test } from 'bun:test';

if (process.platform === 'darwin') {
  const { internal } = await import('./macos.js');

  describe('macos meeting detector parser', () => {
    test('maps known process names to desktop observations', () => {
      expect(internal.toDesktopObservation({ pid: 1, processName: 'Slack' })).toMatchObject({
        key: 'desktop:slack',
        platform: 'slack',
        kind: 'desktop',
        displayName: 'Slack',
        processNames: ['Slack'],
      });

      expect(
        internal.toDesktopObservation({ pid: 2, processName: 'Microsoft Teams Helper' }),
      ).toMatchObject({
        key: 'desktop:teams',
        platform: 'teams',
        kind: 'desktop',
        displayName: 'Microsoft Teams',
      });
    });

    test('maps browser process and title to google meet observation', () => {
      const observation = internal.toBrowserObservation({
        pid: 3,
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
      expect(internal.toDesktopObservation({ pid: 4, processName: 'Finder' })).toBeNull();
      expect(
        internal.toBrowserObservation({
          pid: 5,
          processName: 'Google Chrome',
          windowTitle: 'Inbox - Gmail',
        }),
      ).toBeNull();
    });
  });
}
