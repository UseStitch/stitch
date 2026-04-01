import { MacMeetingService } from './meetings/mac-meeting.js';
import { WindowsMeetingService } from './meetings/windows-meeting.js';

import type { MeetingService } from './meetings/meeting-service.js';
import type { RecordingWriter } from './writers/recording-writer.js';

export type {
  MeetingInfo,
  MeetingServiceEvents,
  MeetingService,
  MeetingServiceLogger,
  StartRecordingOnDemandOptions,
} from './meetings/meeting-service.js';
export type {
  RecordingFile,
  RecordingHandle,
  RecordingResult,
  RecordingWriterOptions,
  RecordingErrorCallback,
} from './writers/recording-writer.js';
export { MeetingEventEmitter } from './meetings/meeting-service.js';
export { RecordingWriter } from './writers/recording-writer.js';

export interface CreateMeetingServiceOptions {
  apps: string[];
  writer: RecordingWriter;
  pollIntervalMs?: number;
  logger?: import('./meetings/meeting-service.js').MeetingServiceLogger;
}

export function createMeetingService(options: CreateMeetingServiceOptions): MeetingService {
  const platform = process.platform;

  if (platform === 'win32') {
    return new WindowsMeetingService({
      apps: options.apps,
      writer: options.writer,
      pollIntervalMs: options.pollIntervalMs,
      logger: options.logger,
    });
  }

  if (platform === 'darwin') {
    return new MacMeetingService({
      apps: options.apps,
      writer: options.writer,
      pollIntervalMs: options.pollIntervalMs,
      logger: options.logger,
    });
  }

  throw new Error(`Unsupported platform: ${platform}`);
}
