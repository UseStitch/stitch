import { createMeetingDetector } from '@stitch/meeting-detection';
import type { MeetingCallDetectedPayload, MeetingCallEndedPayload } from '@stitch/shared/recordings/meeting-ipc';

import type { BrowserWindow } from 'electron';

const detector = createMeetingDetector(process.platform, {
  activationThresholdMs: 5_000,
  cooldownMs: 10 * 60_000,
  endGraceMs: 20_000,
  minRepromptIntervalMs: 2 * 60_000,
});

let unsubscribe: (() => void) | null = null;
let started = false;

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
      const payload: MeetingCallEndedPayload = { key: event.key, endedAt: event.endedAt };
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

export function dismissMeetingDetection(key: string): void {
  detector.dismiss(key);
}
