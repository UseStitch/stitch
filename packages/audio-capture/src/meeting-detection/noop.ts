import type { MeetingDetection, MeetingDetectionListener, MeetingDetector } from '../types.js';

export function createNoopMeetingDetector(): MeetingDetector {
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
