import { createNativeWatcherMeetingDetector } from './watcher.js';
import { classifyWindowsRows } from './windows-classify.js';

import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';

export function createWindowsMeetingDetector(
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  return createNativeWatcherMeetingDetector(classifyWindowsRows, options);
}
