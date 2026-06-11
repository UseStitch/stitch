import { createMeetingDetector, resolveMeetingWatcherBinaryPath } from '@stitch/audio-capture';
import type {
  MeetingCallDetectedPayload,
  MeetingCallEndedPayload,
} from '@stitch/shared/recordings/meeting-ipc';

import type { BrowserWindow } from 'electron';

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

export function startMeetingDetection(
  getWindow: () => BrowserWindow | null,
  onCallDetected?: (payload: MeetingCallDetectedPayload) => void,
  onCallEnded?: (payload: MeetingCallEndedPayload) => void,
): void {
  if (started) {
    return;
  }

  started = true;
  unsubscribe = detector.subscribe((event) => {
    const webContents = getWindow()?.webContents;

    if (event.type === 'ended') {
      const payload: MeetingCallEndedPayload = {
        key: event.key,
        endedAt: event.endedAt,
      };
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('meeting:call-ended', payload);
      }
      onCallEnded?.(payload);
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
    if (webContents && !webContents.isDestroyed()) {
      webContents.send('meeting:call-detected', payload);
    }
    onCallDetected?.(payload);
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
