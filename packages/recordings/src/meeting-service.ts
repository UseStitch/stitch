import { EventEmitter } from "events";
import type { RecordingResult } from "./recording-writer.js";

export interface MeetingInfo {
  /** Unique ID for this meeting session */
  id: string;
  /** App that triggered the meeting (e.g. "slack.exe") */
  app: string;
  /** Full exe path */
  appPath: string;
  /** When the meeting started */
  startedAt: Date;
}

export interface MeetingServiceEvents {
  "meeting:start": (meeting: MeetingInfo) => void;
  "meeting:stop": (meeting: MeetingInfo) => void;
  "recording:write": (meeting: MeetingInfo, result: RecordingResult) => void;
  error: (err: Error) => void;
}

export interface MeetingService {
  start(): Promise<void>;
  stop(): Promise<void>;
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
