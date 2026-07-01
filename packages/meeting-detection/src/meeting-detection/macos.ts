import { classifyMacosRows } from './macos-classify.js';
import { createNativeWatcherMeetingDetector } from './watcher.js';

import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';

export function createMacosMeetingDetector(options: MeetingDetectionOptions = {}): MeetingDetector {
  return createNativeWatcherMeetingDetector(classifyMacosRows, options);
}
