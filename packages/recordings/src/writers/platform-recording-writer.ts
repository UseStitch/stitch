import { MicrophoneRecorder, SystemAudioRecorder } from 'native-audio-node';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { open, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { WriteStream } from 'node:fs';

const SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 100;
const BYTES_PER_FLOAT32_SAMPLE = 4;
const DEFAULT_MAX_DURATION_SECS = 4 * 60 * 60;
const STALE_DEVICE_THRESHOLD_MS = 5_000;
const HEALTH_CHECK_INTERVAL_MS = 2_000;
const READ_CHUNK_BYTES = 65_536;

export interface RecordingFile {
  name: string;
  path: string;
  durationSecs: number;
}

export interface RecordingResult {
  id: string;
  dir: string;
  file: RecordingFile;
}

export interface RecordingHandle {
  readonly id: string;
  readonly dir: string;
  readonly startedAt: Date;
}

export interface RecordingWriterOptions {
  maxDurationSecs?: number;
}

export type RecordingErrorCallback = (error: Error) => void;

class ActiveRecording implements RecordingHandle {
  readonly id: string;
  readonly dir: string;
  readonly startedAt: Date;

  readonly micRecorder: MicrophoneRecorder;
  readonly sysRecorder: SystemAudioRecorder;
  readonly micStream: WriteStream;
  readonly sysStream: WriteStream;
  readonly micRawPath: string;
  readonly sysRawPath: string;

  micBytesWritten = 0;
  sysBytesWritten = 0;
  lastMicChunkAt: number;
  lastSysChunkAt: number;

  healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  onError: RecordingErrorCallback | null = null;
  stopped = false;

  constructor(
    id: string,
    dir: string,
    micRecorder: MicrophoneRecorder,
    sysRecorder: SystemAudioRecorder,
    micStream: WriteStream,
    sysStream: WriteStream,
    micRawPath: string,
    sysRawPath: string,
  ) {
    this.id = id;
    this.dir = dir;
    this.startedAt = new Date();
    this.micRecorder = micRecorder;
    this.sysRecorder = sysRecorder;
    this.micStream = micStream;
    this.sysStream = sysStream;
    this.micRawPath = micRawPath;
    this.sysRawPath = sysRawPath;

    const now = Date.now();
    this.lastMicChunkAt = now;
    this.lastSysChunkAt = now;
  }

  clearTimers(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }
}

function closeWriteStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.end(() => {
      stream.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function buildWavHeader(dataSize: number, sampleRate: number): Buffer {
  const channels = 2;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return header;
}

async function interleaveToWav(
  micPath: string,
  sysPath: string,
  outPath: string,
  sampleRate: number,
): Promise<number> {
  const [micStat, sysStat] = await Promise.all([stat(micPath), stat(sysPath)]);
  const micBytes = micStat.size;
  const sysBytes = sysStat.size;

  const micSamples = micBytes / BYTES_PER_FLOAT32_SAMPLE;
  const sysSamples = sysBytes / BYTES_PER_FLOAT32_SAMPLE;
  const totalSamples = Math.max(micSamples, sysSamples);
  const dataSize = totalSamples * 4;

  const [micFh, sysFh] = await Promise.all([open(micPath, 'r'), open(sysPath, 'r')]);

  try {
    const wavHeader = buildWavHeader(dataSize, sampleRate);
    const outStream = createWriteStream(outPath);

    await new Promise<void>((resolve, reject) => {
      outStream.write(wavHeader, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const samplesPerChunk = Math.floor(READ_CHUNK_BYTES / BYTES_PER_FLOAT32_SAMPLE);
    let samplesProcessed = 0;

    while (samplesProcessed < totalSamples) {
      const samplesToRead = Math.min(samplesPerChunk, totalSamples - samplesProcessed);
      const float32ByteCount = samplesToRead * BYTES_PER_FLOAT32_SAMPLE;
      const fileOffset = samplesProcessed * BYTES_PER_FLOAT32_SAMPLE;

      const micBuf = Buffer.alloc(float32ByteCount);
      const sysBuf = Buffer.alloc(float32ByteCount);

      const [micRead, sysRead] = await Promise.all([
        micFh.read(micBuf, 0, float32ByteCount, fileOffset),
        sysFh.read(sysBuf, 0, float32ByteCount, fileOffset),
      ]);

      const int16Chunk = Buffer.alloc(samplesToRead * 4);
      for (let i = 0; i < samplesToRead; i++) {
        const micSample =
          i < micRead.bytesRead / BYTES_PER_FLOAT32_SAMPLE
            ? Math.max(-1, Math.min(1, micBuf.readFloatLE(i * BYTES_PER_FLOAT32_SAMPLE)))
            : 0;
        const sysSample =
          i < sysRead.bytesRead / BYTES_PER_FLOAT32_SAMPLE
            ? Math.max(-1, Math.min(1, sysBuf.readFloatLE(i * BYTES_PER_FLOAT32_SAMPLE)))
            : 0;

        int16Chunk.writeInt16LE(Math.round(micSample * 32767), i * 4);
        int16Chunk.writeInt16LE(Math.round(sysSample * 32767), i * 4 + 2);
      }

      const canContinue = outStream.write(int16Chunk);
      if (!canContinue) {
        await new Promise<void>((resolve) => outStream.once('drain', resolve));
      }

      samplesProcessed += samplesToRead;
    }

    await new Promise<void>((resolve, reject) => {
      outStream.end((err: Error | null | undefined) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return totalSamples / sampleRate;
  } finally {
    await Promise.all([micFh.close(), sysFh.close()]);
  }
}

export abstract class PlatformRecordingWriter {
  private readonly baseDir: string;
  private readonly maxDurationSecs: number;
  private readonly activeRecordings = new Map<string, ActiveRecording>();

  constructor(baseDir: string, options?: RecordingWriterOptions) {
    if (!existsSync(baseDir)) {
      throw new Error(`RecordingWriter: directory does not exist: ${baseDir}`);
    }
    if (!statSync(baseDir).isDirectory()) {
      throw new Error(`RecordingWriter: path is not a directory: ${baseDir}`);
    }
    this.baseDir = baseDir;
    this.maxDurationSecs = options?.maxDurationSecs ?? DEFAULT_MAX_DURATION_SECS;
  }

  protected abstract normalizeChunk(chunk: Buffer): Buffer;

  async start(recordingId: string, onError?: RecordingErrorCallback): Promise<RecordingHandle> {
    const dir = join(this.baseDir, recordingId);
    mkdirSync(dir, { recursive: true });

    const micRawPath = join(dir, 'mic.raw');
    const sysRawPath = join(dir, 'speaker.raw');

    const micStream = createWriteStream(micRawPath);
    const sysStream = createWriteStream(sysRawPath);

    const micRecorder = new MicrophoneRecorder({
      sampleRate: SAMPLE_RATE,
      chunkDurationMs: CHUNK_DURATION_MS,
    });

    const sysRecorder = new SystemAudioRecorder({
      sampleRate: SAMPLE_RATE,
      chunkDurationMs: CHUNK_DURATION_MS,
      emitSilence: true,
    });

    const recording = new ActiveRecording(
      recordingId,
      dir,
      micRecorder,
      sysRecorder,
      micStream,
      sysStream,
      micRawPath,
      sysRawPath,
    );

    if (onError) {
      recording.onError = onError;
    }

    micRecorder.on('data', (chunk) => {
      recording.lastMicChunkAt = Date.now();
      const data = this.normalizeChunk(chunk.data);
      recording.micBytesWritten += data.length;
      recording.micStream.write(data);
    });

    sysRecorder.on('data', (chunk) => {
      recording.lastSysChunkAt = Date.now();
      const data = this.normalizeChunk(chunk.data);
      recording.sysBytesWritten += data.length;
      recording.sysStream.write(data);
    });

    micRecorder.on('error', (err: Error) => {
      recording.onError?.(new Error(`Microphone recorder error: ${err.message}`));
    });

    sysRecorder.on('error', (err: Error) => {
      recording.onError?.(new Error(`System audio recorder error: ${err.message}`));
    });

    recording.healthCheckTimer = setInterval(() => {
      const now = Date.now();
      if (now - recording.lastMicChunkAt > STALE_DEVICE_THRESHOLD_MS) {
        recording.onError?.(
          new Error('No microphone data received for 5s — device may be disconnected'),
        );
      }
      if (now - recording.lastSysChunkAt > STALE_DEVICE_THRESHOLD_MS) {
        recording.onError?.(
          new Error('No system audio data received for 5s — device may be disconnected'),
        );
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    recording.maxDurationTimer = setTimeout(async () => {
      recording.onError?.(
        new Error(`Recording reached max duration of ${this.maxDurationSecs}s — auto-stopping`),
      );
    }, this.maxDurationSecs * 1000);

    this.activeRecordings.set(recordingId, recording);
    await Promise.all([micRecorder.start(), sysRecorder.start()]);
    return recording;
  }

  async stop(handle: RecordingHandle): Promise<RecordingResult> {
    const recording = this.activeRecordings.get(handle.id);
    if (!recording) {
      throw new Error(`No active recording with id: ${handle.id}`);
    }
    if (recording.stopped) {
      throw new Error(`Recording already stopped: ${handle.id}`);
    }

    recording.stopped = true;
    recording.clearTimers();
    this.activeRecordings.delete(handle.id);

    await Promise.all([recording.micRecorder.stop(), recording.sysRecorder.stop()]);
    await Promise.all([
      closeWriteStream(recording.micStream),
      closeWriteStream(recording.sysStream),
    ]);

    const wavPath = join(recording.dir, 'recording.wav');
    const durationSecs = await interleaveToWav(
      recording.micRawPath,
      recording.sysRawPath,
      wavPath,
      SAMPLE_RATE,
    );

    await Promise.all([
      rm(recording.micRawPath, { force: true }),
      rm(recording.sysRawPath, { force: true }),
    ]);

    return {
      id: recording.id,
      dir: recording.dir,
      file: { name: 'recording.wav', path: wavPath, durationSecs },
    };
  }

  async discard(handle: RecordingHandle): Promise<void> {
    const recording = this.activeRecordings.get(handle.id);
    if (!recording) {
      throw new Error(`No active recording with id: ${handle.id}`);
    }
    if (recording.stopped) return;

    recording.stopped = true;
    recording.clearTimers();
    this.activeRecordings.delete(handle.id);

    await Promise.all([recording.micRecorder.stop(), recording.sysRecorder.stop()]);
    await Promise.all([
      closeWriteStream(recording.micStream),
      closeWriteStream(recording.sysStream),
    ]);

    await rm(recording.dir, { recursive: true, force: true });
  }
}
