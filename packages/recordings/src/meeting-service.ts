import { EventEmitter } from 'events';

import type { RecordingResult } from './recording-writer.js';

export interface MeetingServiceLogger {
  debug(extra: Record<string, any>, message: string): void;
  info(extra: Record<string, any>, message: string): void;
  warn(extra: Record<string, any>, message: string): void;
  error(extra: Record<string, any>, message: string): void;
}

export interface MeetingInfo {
  /** Unique ID for this meeting session (uses shared `rec_` prefix) */
  id: string;
  /** App that triggered the meeting (e.g. "slack.exe") */
  app: string;
  /** Full exe path */
  appPath: string;
  /** When the meeting was first detected */
  startedAt: Date;
}

export interface MeetingServiceEvents {
  'meeting:start': (meeting: MeetingInfo) => void;
  'meeting:stop': (meeting: MeetingInfo) => void;
  'recording:write': (meeting: MeetingInfo, result: RecordingResult) => void;
  error: (err: Error) => void;
}

export interface StartRecordingOnDemandOptions {
  app: string;
  appPath: string;
  startedAt?: Date;
}

export interface MeetingService {
  start(): Promise<void>;
  stop(): Promise<void>;
  startRecording(meetingId: string): Promise<void>;
  startRecordingOnDemand(
    meetingId: string,
    options: StartRecordingOnDemandOptions,
  ): Promise<MeetingInfo>;
  stopRecording(meetingId: string): Promise<RecordingResult>;
  /** Cancel a detected or recording meeting without producing output files. */
  cancelMeeting(meetingId: string): Promise<void>;
  on<K extends keyof MeetingServiceEvents>(event: K, listener: MeetingServiceEvents[K]): this;
  off<K extends keyof MeetingServiceEvents>(event: K, listener: MeetingServiceEvents[K]): this;
}

export class MeetingEventEmitter extends EventEmitter {
  override on<K extends keyof MeetingServiceEvents>(
    event: K,
    listener: MeetingServiceEvents[K],
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof MeetingServiceEvents>(
    event: K,
    listener: MeetingServiceEvents[K],
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof MeetingServiceEvents>(
    event: K,
    ...args: Parameters<MeetingServiceEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
