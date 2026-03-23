import type { MeetingService } from "./meeting-service.js";
import { RecordingWriter } from "./recording-writer.js";
import { WindowsMeetingService } from "./windows-meeting.js";

export type { MeetingInfo, MeetingServiceEvents, MeetingService } from "./meeting-service.js";
export type { RecordingFile, RecordingResult } from "./recording-writer.js";
export { MeetingEventEmitter } from "./meeting-service.js";
export { RecordingWriter } from "./recording-writer.js";

export interface CreateMeetingServiceOptions {
  apps: string[];
  writer: RecordingWriter;
  pollIntervalMs?: number;
}

export function createMeetingService(options: CreateMeetingServiceOptions): MeetingService {
  const platform = process.platform;

  if (platform === "win32") {
    return new WindowsMeetingService(options);
  }

  if (platform === "darwin") {
    throw new Error("macOS meeting service is not implemented yet");
  }

  throw new Error(`Unsupported platform: ${platform}`);
}
