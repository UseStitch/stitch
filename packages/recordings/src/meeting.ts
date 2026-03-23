import { EventEmitter } from "events";
import { existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import {
  MicrophoneRecorder,
  SystemAudioRecorder,
} from "native-audio-node";

// ============================================================
// RecordingWriter
// ============================================================

const SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 100;

/** Convert float32 LE PCM buffers to int16 LE PCM */
function float32ToInt16(f32Buffers: Buffer[]): Buffer {
  const f32 = Buffer.concat(f32Buffers);
  const sampleCount = f32.length / 4;
  const int16 = Buffer.alloc(sampleCount * 2);

  for (let i = 0; i < sampleCount; i++) {
    let sample = f32.readFloatLE(i * 4);
    sample = Math.max(-1, Math.min(1, sample));
    int16.writeInt16LE(Math.round(sample * 32767), i * 2);
  }

  return int16;
}

function buildWavBuffer(pcmFloat32Buffers: Buffer[], sampleRate: number, channels: number = 1): Buffer {
  const pcm = float32ToInt16(pcmFloat32Buffers);
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

export interface RecordingFile {
  name: string;
  path: string;
  durationSecs: number;
}

export interface RecordingResult {
  id: string;
  dir: string;
  files: RecordingFile[];
}

interface ActiveRecording {
  id: string;
  dir: string;
  micRecorder: MicrophoneRecorder;
  sysRecorder: SystemAudioRecorder;
  micChunks: Buffer[];
  sysChunks: Buffer[];
  startedAt: Date;
}

export class RecordingWriter {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    if (!existsSync(baseDir)) {
      throw new Error(`RecordingWriter: directory does not exist: ${baseDir}`);
    }
    if (!statSync(baseDir).isDirectory()) {
      throw new Error(`RecordingWriter: path is not a directory: ${baseDir}`);
    }
    this.baseDir = baseDir;
  }

  /** Start capturing mic + speaker audio. Returns a handle to stop later. */
  async start(recordingId: string): Promise<ActiveRecording> {
    const dir = join(this.baseDir, recordingId);
    mkdirSync(dir, { recursive: true });

    const micRecorder = new MicrophoneRecorder({
      sampleRate: SAMPLE_RATE,
      chunkDurationMs: CHUNK_DURATION_MS,
    });

    const sysRecorder = new SystemAudioRecorder({
      sampleRate: SAMPLE_RATE,
      chunkDurationMs: CHUNK_DURATION_MS,
      emitSilence: true,
    });

    const recording: ActiveRecording = {
      id: recordingId,
      dir,
      micRecorder,
      sysRecorder,
      micChunks: [],
      sysChunks: [],
      startedAt: new Date(),
    };

    micRecorder.on("data", (chunk) => {
      recording.micChunks.push(chunk.data);
    });

    sysRecorder.on("data", (chunk) => {
      recording.sysChunks.push(chunk.data);
    });

    await Promise.all([micRecorder.start(), sysRecorder.start()]);

    return recording;
  }

  /** Stop recording and write WAV files to <baseDir>/<recordingId>/. */
  async stop(recording: ActiveRecording): Promise<RecordingResult> {
    await Promise.all([
      recording.micRecorder.stop(),
      recording.sysRecorder.stop(),
    ]);

    const micPath = join(recording.dir, "mic.wav");
    const sysPath = join(recording.dir, "speaker.wav");

    writeFileSync(micPath, buildWavBuffer(recording.micChunks, SAMPLE_RATE));
    writeFileSync(sysPath, buildWavBuffer(recording.sysChunks, SAMPLE_RATE));

    const micDuration = recording.micChunks.reduce((n, b) => n + b.length, 0) / 4 / SAMPLE_RATE;
    const sysDuration = recording.sysChunks.reduce((n, b) => n + b.length, 0) / 4 / SAMPLE_RATE;

    return {
      id: recording.id,
      dir: recording.dir,
      files: [
        { name: "mic.wav", path: micPath, durationSecs: micDuration },
        { name: "speaker.wav", path: sysPath, durationSecs: sysDuration },
      ],
    };
  }

  /** Stop recording without writing any files. */
  async discard(recording: ActiveRecording): Promise<void> {
    await Promise.all([
      recording.micRecorder.stop(),
      recording.sysRecorder.stop(),
    ]);
  }
}

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
