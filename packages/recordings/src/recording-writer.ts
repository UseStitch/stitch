import { existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import {
  MicrophoneRecorder,
  SystemAudioRecorder,
} from "native-audio-node";

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

export interface ActiveRecording {
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