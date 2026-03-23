import { EventEmitter } from "events";
import type { ActiveRecording, RecordingResult } from "./recording-writer.js";
import { RecordingWriter } from "./recording-writer.js";

// ============================================================
// MeetingService
// ============================================================

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

// ============================================================
// WindowsMeetingService
// ============================================================

const REG_BASE =
  "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";

interface MicRegistryEntry {
  app: string;
  path: string;
  key: string;
}

interface ActiveSession {
  meeting: MeetingInfo;
  recording: ActiveRecording;
  registryKey: string;
}

export interface WindowsMeetingServiceOptions {
  /** List of exe names to monitor (e.g. ["slack.exe", "Discord.exe", "Zoom.exe"]). Case-insensitive. */
  apps: string[];
  /** RecordingWriter instance */
  writer: RecordingWriter;
  /** Polling interval in ms (default 1000) */
  pollIntervalMs?: number;
}

export class WindowsMeetingService implements MeetingService {
  private readonly events = new EventEmitter();
  private readonly apps: Set<string>;
  private readonly writer: RecordingWriter;
  private readonly pollIntervalMs: number;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private baseline = new Set<string>();
  private sessions = new Map<string, ActiveSession>();
  private running = false;

  constructor(options: WindowsMeetingServiceOptions) {
    this.apps = new Set(options.apps.map((a) => a.toLowerCase()));
    this.writer = options.writer;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  on<K extends keyof MeetingServiceEvents>(event: K, listener: MeetingServiceEvents[K]): this {
    this.events.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof MeetingServiceEvents>(event: K, listener: MeetingServiceEvents[K]): this {
    this.events.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  private emit<K extends keyof MeetingServiceEvents>(
    event: K,
    ...args: Parameters<MeetingServiceEvents[K]>
  ): void {
    this.events.emit(event, ...args);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Snapshot baseline — ignore pre-existing mic sessions
    const initial = await this.queryActiveMicApps();
    this.baseline = new Set(initial.map((e) => e.key));

    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Discard any in-progress recordings
    for (const [, session] of this.sessions) {
      await this.writer.discard(session.recording);
    }
    this.sessions.clear();
  }

  // -- Internals --

  private async poll(): Promise<void> {
    try {
      const entries = await this.queryActiveMicApps();
      const currentKeys = new Set(entries.map((e) => e.key));

      // Detect new meetings
      for (const entry of entries) {
        if (this.baseline.has(entry.key)) continue;
        if (this.sessions.has(entry.key)) continue;
        if (!this.isMonitoredApp(entry.app)) continue;

        const now = new Date();
        const id = this.buildRecordingId(entry.app, now);

        const meeting: MeetingInfo = {
          id,
          app: entry.app,
          appPath: entry.path,
          startedAt: now,
        };

        const recording = await this.writer.start(id);
        this.sessions.set(entry.key, { meeting, recording, registryKey: entry.key });
        this.emit("meeting:start", meeting);
      }

      // Detect ended meetings
      for (const [key, session] of this.sessions) {
        if (!currentKeys.has(key)) {
          this.sessions.delete(key);
          this.emit("meeting:stop", session.meeting);

          const result = await this.writer.stop(session.recording);
          this.emit("recording:write", session.meeting, result);
        }
      }

      // Promote baseline entries that disappeared (so they're detected fresh next time)
      for (const key of this.baseline) {
        if (!currentKeys.has(key)) {
          this.baseline.delete(key);
        }
      }
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  private isMonitoredApp(appName: string): boolean {
    return this.apps.has(appName.toLowerCase());
  }

  private buildRecordingId(app: string, date: Date): string {
    const ts = date
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    const slug = app.replace(/\.exe$/i, "").toLowerCase();
    return `${ts}_${slug}`;
  }

  private async queryActiveMicApps(): Promise<MicRegistryEntry[]> {
    const proc = Bun.spawn(
      [
        "powershell",
        "-NoProfile",
        "-Command",
        `reg query '${REG_BASE}' /s /v LastUsedTimeStop`,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const text = await new Response(proc.stdout).text();
    await proc.exited;

    return this.parseRegistryOutput(text);
  }

  private parseRegistryOutput(output: string): MicRegistryEntry[] {
    const entries: MicRegistryEntry[] = [];
    const blocks = output.split(/\r?\n\r?\n/);

    for (const block of blocks) {
      const lines = block.trim().split(/\r?\n/);
      if (lines.length < 2) continue;

      const keyLine = lines[0];
      if (!keyLine) continue;

      const valueLine = lines.find((l) => l.includes("LastUsedTimeStop"));
      if (!valueLine) continue;

      const match = valueLine.match(/REG_QWORD\s+(0x[0-9a-fA-F]+)/);
      if (!match || !match[1]) continue;

      if (BigInt(match[1]) !== 0n) continue;

      const subkey = keyLine.split("\\").pop() || "";
      const exePath = subkey.replace(/#/g, "\\");
      const appName = exePath.split("\\").pop() || subkey;

      entries.push({ app: appName, path: exePath, key: subkey });
    }

    return entries;
  }
}
