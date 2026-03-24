import { existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import {
  MicrophoneRecorder,
  SystemAudioRecorder,
} from "native-audio-node";

const SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 100;

/** Interleave two mono float32 buffer arrays into a stereo int16 LE PCM buffer.
 *  Left channel = mic, right channel = speaker. The shorter stream is zero-padded. */
function interleaveStereoInt16(micBuffers: Buffer[], sysBuffers: Buffer[]): Buffer {
  const mic = Buffer.concat(micBuffers);
  const sys = Buffer.concat(sysBuffers);

  const micSamples = mic.length / 4;
  const sysSamples = sys.length / 4;
  const sampleCount = Math.max(micSamples, sysSamples);

  // 2 channels * 2 bytes per sample
  const int16 = Buffer.alloc(sampleCount * 4);

  for (let i = 0; i < sampleCount; i++) {
    const micSample = i < micSamples
      ? Math.max(-1, Math.min(1, mic.readFloatLE(i * 4)))
      : 0;
    const sysSample = i < sysSamples
      ? Math.max(-1, Math.min(1, sys.readFloatLE(i * 4)))
      : 0;

    int16.writeInt16LE(Math.round(micSample * 32767), i * 4);
    int16.writeInt16LE(Math.round(sysSample * 32767), i * 4 + 2);
  }

  return int16;
}

function buildStereoWavBuffer(micBuffers: Buffer[], sysBuffers: Buffer[], sampleRate: number): Buffer {
  const pcm = interleaveStereoInt16(micBuffers, sysBuffers);
  const channels = 2;
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
  /** Single stereo WAV: left channel = mic, right channel = speaker */
  file: RecordingFile;
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

  /** Stop recording and write a stereo WAV file to <baseDir>/<recordingId>/. */
  async stop(recording: ActiveRecording): Promise<RecordingResult> {
    await Promise.all([
      recording.micRecorder.stop(),
      recording.sysRecorder.stop(),
    ]);

    const filePath = join(recording.dir, "recording.wav");

    writeFileSync(filePath, buildStereoWavBuffer(recording.micChunks, recording.sysChunks, SAMPLE_RATE));

    const micSamples = recording.micChunks.reduce((n, b) => n + b.length, 0) / 4;
    const sysSamples = recording.sysChunks.reduce((n, b) => n + b.length, 0) / 4;
    const durationSecs = Math.max(micSamples, sysSamples) / SAMPLE_RATE;

    return {
      id: recording.id,
      dir: recording.dir,
      file: { name: "recording.wav", path: filePath, durationSecs },
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