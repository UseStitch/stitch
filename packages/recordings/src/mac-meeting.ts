import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRecordingId } from '@stitch/shared/id';

import type { MeetingInfo, MeetingService, MeetingServiceLogger } from './meeting-service.js';
import { MeetingEventEmitter } from './meeting-service.js';
import type { RecordingHandle, RecordingResult } from './recording-writer.js';
import type { RecordingWriter } from './recording-writer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the mic-status binary path.
 * In development: relative to this source file (../native/mic-status).
 * In production (bun --compile): next to the server binary (same directory as process.execPath).
 */
function resolveMicStatusBinary(): string {
  const devPath = join(__dirname, '..', 'native', 'mic-status');
  if (existsSync(devPath)) return devPath;

  const prodPath = join(dirname(process.execPath), 'mic-status');
  if (existsSync(prodPath)) return prodPath;

  throw new Error(
    `mic-status binary not found. Checked:\n  ${devPath}\n  ${prodPath}\nRun "bun run build:native" in packages/recordings.`,
  );
}

interface MicStatusEntry {
  pid: number;
  name: string;
  bundleId: string;
}

/** A meeting that was detected but not yet recording */
interface DetectedMeeting {
  meeting: MeetingInfo;
  processKey: string;
}

/** A meeting that has an active recording */
interface RecordingSession {
  meeting: MeetingInfo;
  handle: RecordingHandle;
  processKey: string;
}

interface MacMeetingServiceOptions {
  /** Keywords to match against app/bundle names (e.g. ["slack", "discord", "zoom"]). Case-insensitive substring match. */
  apps: string[];
  /** RecordingWriter instance */
  writer: RecordingWriter;
  /** Polling interval in ms (default 1000) */
  pollIntervalMs?: number;
  /** Optional logger -- if omitted, logging is silently skipped */
  logger?: MeetingServiceLogger;
}

const noopLogger: MeetingServiceLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export class MacMeetingService extends MeetingEventEmitter implements MeetingService {
  private readonly apps: string[];
  private readonly writer: RecordingWriter;
  private readonly pollIntervalMs: number;
  private readonly log: MeetingServiceLogger;

  private micStatusBinary: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private baseline = new Set<string>();

  /** Detected meetings that are not yet recording */
  private detected = new Map<string, DetectedMeeting>();
  /** Map from meetingId -> processKey for quick lookup */
  private meetingIdToKey = new Map<string, string>();
  /** Meetings that are actively recording */
  private recordings = new Map<string, RecordingSession>();

  private running = false;
  private polling = false;

  constructor(options: MacMeetingServiceOptions) {
    super();
    this.apps = options.apps.map((a) => a.toLowerCase());
    this.writer = options.writer;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.log = options.logger ?? noopLogger;
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.micStatusBinary = resolveMicStatusBinary();
    this.running = true;

    const initial = await this.queryActiveMicApps();
    this.baseline = new Set(initial.map((e) => buildProcessKey(e)));

    this.log.info(
      { baselineCount: initial.length, baselineApps: initial.map((e) => e.name), keywords: this.apps },
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
    this.detected.clear();
    this.meetingIdToKey.clear();
    this.recordings.clear();
    this.log.info({}, 'meeting detection stopped');
  }

  async startRecording(meetingId: string): Promise<void> {
    const processKey = this.meetingIdToKey.get(meetingId);
    if (!processKey) {
      throw new Error(`No detected meeting with id: ${meetingId}`);
    }

    const detected = this.detected.get(processKey);
    if (!detected) {
      throw new Error(`Meeting already ended or is already recording: ${meetingId}`);
    }

    const handle = await this.writer.start(meetingId, (err) => {
      this.log.warn({ meetingId, err: err.message }, 'recording error');
      this.emit('error', err);
    });

    this.detected.delete(processKey);
    this.recordings.set(processKey, {
      meeting: detected.meeting,
      handle,
      processKey,
    });
    this.log.info({ meetingId, app: detected.meeting.app }, 'recording started');
  }

  async stopRecording(meetingId: string): Promise<RecordingResult> {
    const processKey = this.meetingIdToKey.get(meetingId);
    if (!processKey) {
      throw new Error(`No meeting with id: ${meetingId}`);
    }

    const session = this.recordings.get(processKey);
    if (!session) {
      throw new Error(`No active recording for meeting: ${meetingId}`);
    }

    this.recordings.delete(processKey);
    this.meetingIdToKey.delete(meetingId);

    const result = await this.writer.stop(session.handle);
    this.emit('recording:write', session.meeting, result);
    this.log.info({ meetingId }, 'recording stopped');
    return result;
  }

  // -- Internals --

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const entries = await this.queryActiveMicApps();
      this.log.debug({ entryCount: entries.length }, 'poll tick');
      const currentKeys = new Set(entries.map((e) => buildProcessKey(e)));

      if (entries.length > 0) {
        this.log.debug(
          {
            entries: entries.map((e) => {
              const key = buildProcessKey(e);
              return {
                app: e.name,
                bundleId: e.bundleId,
                isBaseline: this.baseline.has(key),
                isDetected: this.detected.has(key),
                isRecording: this.recordings.has(key),
                isMonitored: this.isMonitoredApp(e),
              };
            }),
          },
          'poll: active mic entries',
        );
      }

      // Detect new meetings
      for (const entry of entries) {
        const key = buildProcessKey(entry);
        if (this.baseline.has(key)) continue;
        if (this.detected.has(key)) continue;
        if (this.recordings.has(key)) continue;
        if (!this.isMonitoredApp(entry)) continue;

        const now = new Date();
        const id = createRecordingId();

        const meeting: MeetingInfo = {
          id,
          app: entry.name,
          appPath: entry.bundleId,
          startedAt: now,
        };

        this.log.info({ meetingId: id, app: entry.name, bundleId: entry.bundleId }, 'new meeting detected');
        this.detected.set(key, { meeting, processKey: key });
        this.meetingIdToKey.set(id, key);
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

  private isMonitoredApp(entry: MicStatusEntry): boolean {
    const name = entry.name.toLowerCase();
    const bundleId = entry.bundleId.toLowerCase();
    return this.apps.some((keyword) => name.includes(keyword) || bundleId.includes(keyword));
  }

  private queryActiveMicApps(): Promise<MicStatusEntry[]> {
    return new Promise((resolve) => {
      execFile(this.micStatusBinary!, (err, stdout) => {
        if (err) {
          this.log.warn({ err: err.message }, 'mic-status query failed');
          resolve([]);
          return;
        }
        resolve(this.parseOutput(stdout));
      });
    });
  }

  private parseOutput(output: string): MicStatusEntry[] {
    try {
      const entries: unknown = JSON.parse(output.trim());
      if (!Array.isArray(entries)) return [];

      return entries.filter(
        (e): e is MicStatusEntry =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as MicStatusEntry).pid === 'number' &&
          typeof (e as MicStatusEntry).name === 'string' &&
          typeof (e as MicStatusEntry).bundleId === 'string',
      );
    } catch {
      this.log.warn({ output }, 'failed to parse mic-status output');
      return [];
    }
  }
}

/**
 * Build a stable key for a process. Uses bundleId when available (preferred)
 * because PIDs can be reused. Falls back to pid for the "unknown" fallback case.
 */
function buildProcessKey(entry: MicStatusEntry): string {
  if (entry.bundleId !== 'unknown') {
    return `bundle:${entry.bundleId}`;
  }
  return `pid:${entry.pid}`;
}
