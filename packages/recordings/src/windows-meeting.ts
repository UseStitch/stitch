import { execFile } from 'node:child_process';

import { createRecordingId } from '@stitch/shared/id';

import type {
  MeetingInfo,
  MeetingService,
  MeetingServiceLogger,
  StartRecordingOnDemandOptions,
} from './meeting-service.js';
import { MeetingEventEmitter } from './meeting-service.js';
import type { RecordingHandle, RecordingResult } from './recording-writer.js';
import type { RecordingWriter } from './recording-writer.js';

const REG_BASE =
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';

interface MicRegistryEntry {
  app: string;
  path: string;
  key: string;
}

/** A meeting that was detected but not yet recording */
interface DetectedMeeting {
  meeting: MeetingInfo;
  registryKey: string;
}

/** A meeting that has an active recording */
interface RecordingSession {
  meeting: MeetingInfo;
  handle: RecordingHandle;
  registryKey: string;
}

interface ManualRecordingSession {
  meeting: MeetingInfo;
  handle: RecordingHandle;
}

interface WindowsMeetingServiceOptions {
  /** Keywords to match against app names (e.g. ["slack", "discord", "zoom"]). Case-insensitive substring match. */
  apps: string[];
  /** RecordingWriter instance */
  writer: RecordingWriter;
  /** Polling interval in ms (default 1000) */
  pollIntervalMs?: number;
  /** Optional logger — if omitted, logging is silently skipped */
  logger?: MeetingServiceLogger;
}

const noopLogger: MeetingServiceLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export class WindowsMeetingService extends MeetingEventEmitter implements MeetingService {
  private readonly apps: string[];
  private readonly writer: RecordingWriter;
  private readonly pollIntervalMs: number;
  private readonly log: MeetingServiceLogger;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private baseline = new Set<string>();

  /** Detected meetings that are not yet recording */
  private detected = new Map<string, DetectedMeeting>();
  /** Map from meetingId -> registryKey for quick lookup */
  private meetingIdToKey = new Map<string, string>();
  /** Meetings that are actively recording */
  private recordings = new Map<string, RecordingSession>();
  /** Recordings started manually and not tied to registry keys */
  private manualRecordings = new Map<string, ManualRecordingSession>();

  private running = false;
  private polling = false;

  constructor(options: WindowsMeetingServiceOptions) {
    super();
    this.apps = options.apps.map((a) => a.toLowerCase());
    this.writer = options.writer;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.log = options.logger ?? noopLogger;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const initial = await this.queryActiveMicApps();
    this.baseline = new Set(initial.map((e) => e.key));

    this.log.info(
      { baselineCount: initial.length, baselineApps: initial.map((e) => e.app), keywords: this.apps },
      'meeting detection started',
    );

    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    for (const [, session] of this.recordings) {
      await this.writer.discard(session.handle);
    }
    for (const [, session] of this.manualRecordings) {
      await this.writer.discard(session.handle);
    }
    this.detected.clear();
    this.meetingIdToKey.clear();
    this.recordings.clear();
    this.manualRecordings.clear();
    this.log.info({}, 'meeting detection stopped');
  }

  async startRecording(meetingId: string): Promise<void> {
    const registryKey = this.meetingIdToKey.get(meetingId);
    if (!registryKey) {
      throw new Error(`No detected meeting with id: ${meetingId}`);
    }

    const detected = this.detected.get(registryKey);
    if (!detected) {
      throw new Error(`Meeting already ended or is already recording: ${meetingId}`);
    }

    const handle = await this.writer.start(meetingId, (err) => {
      this.log.warn({ meetingId, err: err.message }, 'recording error');
      this.emit('error', err);
    });

    this.detected.delete(registryKey);
    this.recordings.set(registryKey, {
      meeting: detected.meeting,
      handle,
      registryKey,
    });
    this.log.info({ meetingId, app: detected.meeting.app }, 'recording started');
  }

  async startRecordingOnDemand(
    meetingId: string,
    options: StartRecordingOnDemandOptions,
  ): Promise<MeetingInfo> {
    if (this.meetingIdToKey.has(meetingId) || this.manualRecordings.has(meetingId)) {
      throw new Error(`Meeting already exists: ${meetingId}`);
    }

    const meeting: MeetingInfo = {
      id: meetingId,
      app: options.app,
      appPath: options.appPath,
      startedAt: options.startedAt ?? new Date(),
    };

    const handle = await this.writer.start(meetingId, (err) => {
      this.log.warn({ meetingId, err: err.message }, 'recording error');
      this.emit('error', err);
    });

    this.manualRecordings.set(meetingId, { meeting, handle });
    this.log.info({ meetingId, app: meeting.app }, 'manual recording started');
    return meeting;
  }

  async stopRecording(meetingId: string): Promise<RecordingResult> {
    const registryKey = this.meetingIdToKey.get(meetingId);
    if (!registryKey) {
      const manualSession = this.manualRecordings.get(meetingId);
      if (!manualSession) {
        throw new Error(`No meeting with id: ${meetingId}`);
      }

      this.manualRecordings.delete(meetingId);

      const result = await this.writer.stop(manualSession.handle);
      this.emit('recording:write', manualSession.meeting, result);
      this.log.info({ meetingId }, 'manual recording stopped');
      return result;
    }

    const session = this.recordings.get(registryKey);
    if (!session) {
      throw new Error(`No active recording for meeting: ${meetingId}`);
    }

    this.recordings.delete(registryKey);
    this.meetingIdToKey.delete(meetingId);

    const result = await this.writer.stop(session.handle);
    this.emit('recording:write', session.meeting, result);
    this.log.info({ meetingId }, 'recording stopped');
    return result;
  }

  async cancelMeeting(meetingId: string): Promise<void> {
    const manualSession = this.manualRecordings.get(meetingId);
    if (manualSession) {
      this.manualRecordings.delete(meetingId);
      await this.writer.discard(manualSession.handle);
      this.log.info({ meetingId }, 'manual recording cancelled');
      return;
    }

    const registryKey = this.meetingIdToKey.get(meetingId);
    if (!registryKey) return;

    if (this.detected.has(registryKey)) {
      this.detected.delete(registryKey);
      this.meetingIdToKey.delete(meetingId);
      this.log.info({ meetingId }, 'detected meeting cancelled');
      return;
    }

    const session = this.recordings.get(registryKey);
    if (session) {
      this.recordings.delete(registryKey);
      this.meetingIdToKey.delete(meetingId);
      await this.writer.discard(session.handle);
      this.log.info({ meetingId }, 'active recording cancelled');
    }
  }

  // -- Internals --

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const entries = await this.queryActiveMicApps();
      this.log.debug({ entryCount: entries.length }, 'poll tick');
      const currentKeys = new Set(entries.map((e) => e.key));

      if (entries.length > 0) {
        this.log.debug(
          {
            entries: entries.map((e) => ({
              app: e.app,
              isBaseline: this.baseline.has(e.key),
              isDetected: this.detected.has(e.key),
              isRecording: this.recordings.has(e.key),
              isMonitored: this.isMonitoredApp(e.app),
            })),
          },
          'poll: active mic entries',
        );
      }

      // Detect new meetings (don't auto-record)
      for (const entry of entries) {
        if (this.baseline.has(entry.key)) continue;
        if (this.detected.has(entry.key)) continue;
        if (this.recordings.has(entry.key)) continue;
        if (!this.isMonitoredApp(entry.app)) continue;

        const now = new Date();
        const id = createRecordingId();

        const meeting: MeetingInfo = {
          id,
          app: entry.app,
          appPath: entry.path,
          startedAt: now,
        };

        this.log.info({ meetingId: id, app: entry.app }, 'new meeting detected');
        this.detected.set(entry.key, { meeting, registryKey: entry.key });
        this.meetingIdToKey.set(id, entry.key);
        this.emit('meeting:start', meeting);
      }

      // Collect ended meetings before mutating maps
      const endedDetected: [string, DetectedMeeting][] = [];
      for (const [key, detected] of this.detected) {
        if (!currentKeys.has(key)) {
          endedDetected.push([key, detected]);
        }
      }

      const endedRecordings: [string, RecordingSession][] = [];
      for (const [key, session] of this.recordings) {
        if (!currentKeys.has(key)) {
          endedRecordings.push([key, session]);
        }
      }

      // Process ended detected meetings
      for (const [key, detected] of endedDetected) {
        this.log.info({ meetingId: detected.meeting.id, app: detected.meeting.app }, 'meeting ended (detected)');
        this.detected.delete(key);
        this.meetingIdToKey.delete(detected.meeting.id);
        this.emit('meeting:stop', detected.meeting);
      }

      // Process ended recording sessions
      for (const [key, session] of endedRecordings) {
        this.log.info({ meetingId: session.meeting.id, app: session.meeting.app }, 'meeting ended (recording)');
        this.recordings.delete(key);
        this.meetingIdToKey.delete(session.meeting.id);
        this.emit('meeting:stop', session.meeting);

        const result = await this.writer.stop(session.handle);
        this.emit('recording:write', session.meeting, result);
      }

      // Promote baseline entries that disappeared
      const removedBaseline: string[] = [];
      for (const key of this.baseline) {
        if (!currentKeys.has(key)) {
          removedBaseline.push(key);
        }
      }
      for (const key of removedBaseline) {
        this.baseline.delete(key);
      }
    } catch (err) {
      this.log.error({ err }, 'poll error');
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.polling = false;
    }
  }

  private isMonitoredApp(appName: string): boolean {
    const lower = appName.toLowerCase();
    return this.apps.some((keyword) => lower.includes(keyword));
  }

  private queryActiveMicApps(): Promise<MicRegistryEntry[]> {
    return new Promise((resolve) => {
      execFile(
        'reg',
        ['query', REG_BASE, '/s', '/v', 'LastUsedTimeStop'],
        (err, stdout) => {
          if (err) {
            this.log.warn({ err: err.message }, 'registry query failed');
            resolve([]);
            return;
          }
          resolve(this.parseRegistryOutput(stdout));
        },
      );
    });
  }

  private parseRegistryOutput(output: string): MicRegistryEntry[] {
    const entries: MicRegistryEntry[] = [];
    const blocks = output.split(/\r?\n\r?\n/);

    for (const block of blocks) {
      const lines = block.trim().split(/\r?\n/);
      if (lines.length < 2) continue;

      const keyLine = lines[0];
      if (!keyLine) continue;

      const valueLine = lines.find((l) => l.includes('LastUsedTimeStop'));
      if (!valueLine) continue;

      const match = valueLine.match(/REG_QWORD\s+(0x[0-9a-fA-F]+)/);
      if (!match || !match[1]) continue;

      if (BigInt(match[1]) !== 0n) continue;

      const subkey = keyLine.split('\\').pop() || '';
      const exePath = subkey.replace(/#/g, '\\');
      const appName = exePath.split('\\').pop() || subkey;

      entries.push({ app: appName, path: exePath, key: subkey });
    }

    return entries;
  }
}
