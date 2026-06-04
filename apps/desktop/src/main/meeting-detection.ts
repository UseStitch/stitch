import type { BrowserWindow } from 'electron';

import { createMeetingDetector, resolveMeetingWatcherBinaryPath } from '@stitch/audio-capture';

import type {
  MeetingCallDetectedPayload,
  MeetingCallEndedPayload,
} from '@stitch/shared/chat/realtime';

const detector = createMeetingDetector(process.platform, {
  activationThresholdMs: 5_000,
  cooldownMs: 10 * 60_000,
});

let unsubscribe: (() => void) | null = null;
let started = false;

export function configureMeetingDetectionEnv(): void {
  if (process.env.STITCH_MEETING_WATCH_BIN) {
    return;
  }

  process.env.STITCH_MEETING_WATCH_BIN = resolveMeetingWatcherBinaryPath();
}

export function startMeetingDetection(getWindow: () => BrowserWindow | null): void {
  if (started) {
    return;
  }

  started = true;
  unsubscribe = detector.subscribe((event) => {
    const webContents = getWindow()?.webContents;
    if (!webContents || webContents.isDestroyed()) {
      return;
    }

    if (event.type === 'ended') {
      const payload: MeetingCallEndedPayload = {
        key: event.key,
        endedAt: event.endedAt,
      };
      webContents.send('meeting:call-ended', payload);
      return;
    }

    const payload: MeetingCallDetectedPayload = {
      key: event.detection.key,
      platform: event.detection.platform,
      kind: event.detection.kind,
      displayName: event.detection.displayName,
      processNames: event.detection.processNames,
      windowTitle: event.detection.windowTitle,
      detectedAt: event.detectedAt,
    };
    webContents.send('meeting:call-detected', payload);
  });

  detector.start();
}

export function stopMeetingDetection(): void {
  if (!started) {
    return;
  }

  started = false;
  unsubscribe?.();
  unsubscribe = null;
  detector.stop();
}
