import type { MeetingService } from './meeting-service.js';
import type { RecordingWriter } from './recording-writer.js';
import { MacMeetingService } from './mac-meeting.js';
import { WindowsMeetingService } from './windows-meeting.js';

export type {
  MeetingInfo,
  MeetingServiceEvents,
  MeetingService,
  MeetingServiceLogger,
} from './meeting-service.js';
export type {
  RecordingFile,
  RecordingHandle,
  RecordingResult,
  RecordingWriterOptions,
  RecordingErrorCallback,
} from './recording-writer.js';
export { MeetingEventEmitter } from './meeting-service.js';
export { RecordingWriter } from './recording-writer.js';

export interface CreateMeetingServiceOptions {
  apps: string[];
  writer: RecordingWriter;
  pollIntervalMs?: number;
  logger?: import('./meeting-service.js').MeetingServiceLogger;
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
