import { createMacosMeetingDetector } from './meeting-detection/macos.js';
import { createWindowsMeetingDetector } from './meeting-detection/windows.js';

import type {
  MeetingDetection,
  MeetingDetectionListener,
  MeetingDetectionOptions,
  MeetingDetector,
} from './types.js';

;

export function createMeetingDetector(
  platform: NodeJS.Platform = process.platform,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  if (platform === 'darwin') {
    return createMacosMeetingDetector(options);
  }

  if (platform === 'win32') {
    return createWindowsMeetingDetector(options);
  }

  return {
    start(): void {},
    stop(): void {},
    subscribe(_listener: MeetingDetectionListener): () => void {
      return () => {};
    },
    getActive(): MeetingDetection | null {
      return null;
    },
  };
}
