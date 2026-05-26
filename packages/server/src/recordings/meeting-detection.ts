import { createMeetingDetector } from '@stitch/audio-capture';

import * as Events from '@/lib/events.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'meeting-detection' });

const detector = createMeetingDetector(process.platform, {
  activationThresholdMs: 5_000,
  cooldownMs: 10 * 60_000,
  commandTimeoutMs: 3_000,
});

let unsubscribe: (() => void) | null = null;
let started = false;

export function startMeetingDetection(): void {
  if (started) {
    return;
  }

  started = true;
  unsubscribe = detector.subscribe((event) => {
    if (event.type === 'ended') {
      Events.emit('meeting-call-ended', {
        key: event.key,
        endedAt: event.endedAt,
      });
      return;
    }

    Events.emit('meeting-call-detected', {
      key: event.detection.key,
      platform: event.detection.platform,
      kind: event.detection.kind,
      displayName: event.detection.displayName,
      processNames: event.detection.processNames,
      windowTitle: event.detection.windowTitle,
      detectedAt: event.detectedAt,
    });

    log.info(
      {
        key: event.detection.key,
        platform: event.detection.platform,
        kind: event.detection.kind,
        processNames: event.detection.processNames,
      },
      'meeting call detected',
    );
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
