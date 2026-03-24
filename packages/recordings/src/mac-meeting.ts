import { MicrophoneActivityMonitor } from 'native-audio-node';

import { createRecordingId } from '@stitch/shared/id';

import type { MeetingInfo, MeetingService, MeetingServiceLogger } from './meeting-service.js';
import { MeetingEventEmitter } from './meeting-service.js';
import type { RecordingHandle, RecordingResult } from './recording-writer.js';
import type { RecordingWriter } from './recording-writer.js';

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
  /** Fallback polling interval in ms when native events are unavailable (default 1000) */
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
  private readonly log: MeetingServiceLogger;
  private readonly monitor: MicrophoneActivityMonitor;
  private readonly onMonitorChange: () => void;
  private readonly onMonitorError: (err: Error) => void;

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
    this.log = options.logger ?? noopLogger;

    this.monitor = new MicrophoneActivityMonitor({
      fallbackPollInterval: options.pollIntervalMs ?? 1000,
    });

    this.onMonitorChange = () => {
      void this.reconcileActiveMeetings();
    };

    this.onMonitorError = (err: Error) => {
      this.log.warn({ err: err.message }, 'microphone activity monitor error');
      this.emit('error', err);
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.monitor.on('change', this.onMonitorChange);
    this.monitor.on('error', this.onMonitorError);
    this.monitor.start();

    const initial =  this.queryActiveMicApps();
    this.baseline = new Set(initial.map((e) => buildProcessKey(e)));

    this.log.info(
      { baselineCount: initial.length, baselineApps: initial.map((e) => e.name), keywords: this.apps },
      'meeting detection started',
    );
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    this.monitor.off('change', this.onMonitorChange);
    this.monitor.off('error', this.onMonitorError);
    this.monitor.stop();

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

  private async reconcileActiveMeetings(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const entries =  this.queryActiveMicApps();
      this.log.debug({ entryCount: entries.length }, 'reconcile tick');
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
          'reconcile: active mic entries',
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
      this.log.error({ err }, 'reconcile error');
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

  private queryActiveMicApps(): MicStatusEntry[] {
    const processes = this.monitor.getActiveProcesses();
    return processes.map((processInfo) => ({
      pid: processInfo.pid,
      name: processInfo.name,
      bundleId: processInfo.bundleId,
    }));
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
