import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RecordingWriter } from '../src/recording-writer.js';

import type { RecordingHandle } from '../src/recording-writer.js';

// ---------------------------------------------------------------------------
// Mock native-audio-node
// ---------------------------------------------------------------------------

// Shared references so tests can access the latest recorder instances.
// These are assigned inside the vi.mock factory (which is hoisted).
const recorderRefs: {
  mic: MockRecorderInstance | null;
  sys: MockRecorderInstance | null;
} = { mic: null, sys: null };

/** Type matching the mock recorder shape for use in tests */
interface MockRecorderInstance {
  started: boolean;
  stopped: boolean;
  emitData(samples: number[]): void;
  emitSilence(sampleCount: number): void;
  emitError(msg: string): void;
  on(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, ...args: unknown[]): boolean;
}

vi.mock('native-audio-node', () => {
  const { EventEmitter } = require('node:events');

  class MockRecorder extends EventEmitter {
    started = false;
    stopped = false;

    async start(): Promise<void> {
      this.started = true;
    }

    async stop(): Promise<void> {
      this.stopped = true;
    }

    emitData(samples: number[]): void {
      const buf = Buffer.alloc(samples.length * 4);
      for (let i = 0; i < samples.length; i++) {
        buf.writeFloatLE(samples[i], i * 4);
      }
      this.emit('data', { data: buf });
    }

    emitSilence(sampleCount: number): void {
      this.emitData(Array.from({ length: sampleCount }, () => 0));
    }

    emitError(msg: string): void {
      this.emit('error', new Error(msg));
    }
  }

  return {
    MicrophoneRecorder: class extends MockRecorder {
      constructor() {
        super();
        recorderRefs.mic = this as unknown as MockRecorderInstance;
      }
    },
    SystemAudioRecorder: class extends MockRecorder {
      constructor() {
        super();
        recorderRefs.sys = this as unknown as MockRecorderInstance;
      }
    },
  };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tempDir: string;

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'recording-writer-test-'));
}

beforeEach(() => {
  tempDir = createTempDir();
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('RecordingWriter constructor', () => {
  test('throws when baseDir does not exist', () => {
    expect(() => new RecordingWriter(join(tempDir, 'nonexistent'))).toThrow(
      'directory does not exist',
    );
  });

  test('throws when baseDir is a file, not a directory', () => {
    const filePath = join(tempDir, 'afile.txt');
    writeFileSync(filePath, 'hello');
    expect(() => new RecordingWriter(filePath)).toThrow('path is not a directory');
  });

  test('accepts a valid directory without throwing', () => {
    expect(() => new RecordingWriter(tempDir)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// start()
// ---------------------------------------------------------------------------

describe('start()', () => {
  test('returns a handle with correct id, dir, and startedAt', async () => {
    const now = new Date('2026-01-15T10:00:00.000Z');
    vi.setSystemTime(now);

    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-1');

    expect(handle.id).toBe('rec-1');
    expect(handle.dir).toBe(join(tempDir, 'rec-1'));
    expect(handle.startedAt).toEqual(now);
  });

  test('creates a subdirectory named after the recordingId', async () => {
    const writer = new RecordingWriter(tempDir);
    await writer.start('my-recording');
    expect(existsSync(join(tempDir, 'my-recording'))).toBe(true);
  });

  test('starts both mic and system audio recorders', async () => {
    const writer = new RecordingWriter(tempDir);
    await writer.start('rec-start');
    expect(recorderRefs.mic!.started).toBe(true);
    expect(recorderRefs.sys!.started).toBe(true);
  });

  test('calls onError when mic recorder emits an error', async () => {
    const writer = new RecordingWriter(tempDir);
    const onError = vi.fn();
    await writer.start('rec-err-mic', onError);

    recorderRefs.mic!.emitError('mic died');

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]!.message).toContain('Microphone recorder error');
    expect(onError.mock.calls[0][0]!.message).toContain('mic died');
  });

  test('calls onError when system audio recorder emits an error', async () => {
    const writer = new RecordingWriter(tempDir);
    const onError = vi.fn();
    await writer.start('rec-err-sys', onError);

    recorderRefs.sys!.emitError('speaker died');

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]!.message).toContain('System audio recorder error');
    expect(onError.mock.calls[0][0]!.message).toContain('speaker died');
  });

  test('calls onError when mic device is stale (no data for 5s)', async () => {
    const writer = new RecordingWriter(tempDir);
    const onError = vi.fn();
    await writer.start('rec-stale-mic', onError);

    // Keep sys alive but let mic go stale
    recorderRefs.sys!.emitSilence(1);

    // Advance past the health check interval + stale threshold
    vi.advanceTimersByTime(6_000);

    expect(onError).toHaveBeenCalled();
    const micError = onError.mock.calls.find((c) =>
      (c[0] as Error).message.includes('No microphone data'),
    );
    expect(micError).toBeDefined();
  });

  test('calls onError when system audio device is stale (no data for 5s)', async () => {
    const writer = new RecordingWriter(tempDir);
    const onError = vi.fn();
    await writer.start('rec-stale-sys', onError);

    // Keep mic alive but let sys go stale
    recorderRefs.mic!.emitSilence(1);

    vi.advanceTimersByTime(6_000);

    expect(onError).toHaveBeenCalled();
    const sysError = onError.mock.calls.find((c) =>
      (c[0] as Error).message.includes('No system audio data'),
    );
    expect(sysError).toBeDefined();
  });

  test('calls onError when max duration is reached', async () => {
    const writer = new RecordingWriter(tempDir, { maxDurationSecs: 2 });
    const onError = vi.fn();
    await writer.start('rec-max-dur', onError);

    // Keep both devices alive to avoid stale warnings
    recorderRefs.mic!.emitSilence(1);
    recorderRefs.sys!.emitSilence(1);

    vi.advanceTimersByTime(2_000);

    expect(onError).toHaveBeenCalled();
    const durError = onError.mock.calls.find((c) =>
      (c[0] as Error).message.includes('max duration'),
    );
    expect(durError).toBeDefined();
  });

  test('does not fire stale warning if data keeps arriving', async () => {
    const writer = new RecordingWriter(tempDir);
    const onError = vi.fn();
    await writer.start('rec-healthy', onError);

    // Simulate data arriving every 1s for 10s
    for (let i = 0; i < 10; i++) {
      recorderRefs.mic!.emitSilence(1);
      recorderRefs.sys!.emitSilence(1);
      vi.advanceTimersByTime(1_000);
    }

    const staleErrors = onError.mock.calls.filter(
      (c) =>
        (c[0] as Error).message.includes('No microphone data') ||
        (c[0] as Error).message.includes('No system audio data'),
    );
    expect(staleErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// stop()
// ---------------------------------------------------------------------------

describe('stop()', () => {
  test('throws if recording id is not found', async () => {
    const writer = new RecordingWriter(tempDir);
    const fakeHandle: RecordingHandle = {
      id: 'nonexistent',
      dir: join(tempDir, 'nonexistent'),
      startedAt: new Date(),
    };
    await expect(writer.stop(fakeHandle)).rejects.toThrow('No active recording');
  });

  test('throws if recording was already stopped', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-double-stop');

    // Emit some audio so interleave has data to work with
    recorderRefs.mic!.emitSilence(160);
    recorderRefs.sys!.emitSilence(160);

    await writer.stop(handle);
    await expect(writer.stop(handle)).rejects.toThrow('No active recording');
  });

  test('stops both native recorders', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-stop-recorders');

    recorderRefs.mic!.emitSilence(160);
    recorderRefs.sys!.emitSilence(160);

    const mic = recorderRefs.mic!;
    const sys = recorderRefs.sys!;

    await writer.stop(handle);

    expect(mic.stopped).toBe(true);
    expect(sys.stopped).toBe(true);
  });

  test('clears health check and max duration timers', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir, { maxDurationSecs: 10 });
    const onError = vi.fn();
    const handle = await writer.start('rec-clear-timers', onError);

    recorderRefs.mic!.emitSilence(160);
    recorderRefs.sys!.emitSilence(160);

    await writer.stop(handle);

    // After stopping, no more errors should fire even if we wait a long time
    // (We can't easily test timer clearing directly, but we verify no further callbacks)
    await new Promise((r) => setTimeout(r, 100));
    expect(onError).not.toHaveBeenCalled();
  });

  test('produces a valid stereo WAV file', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-wav');

    // Emit some audio data
    recorderRefs.mic!.emitSilence(1600);
    recorderRefs.sys!.emitSilence(1600);

    const result = await writer.stop(handle);

    expect(result.file.name).toBe('recording.wav');
    expect(result.file.path).toBe(join(tempDir, 'rec-wav', 'recording.wav'));
    expect(existsSync(result.file.path)).toBe(true);

    // Verify WAV header
    const wav = readFileSync(result.file.path);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    // PCM format = 1
    expect(wav.readUInt16LE(20)).toBe(1);
    // 2 channels (stereo)
    expect(wav.readUInt16LE(22)).toBe(2);
    // Sample rate = 16000
    expect(wav.readUInt32LE(24)).toBe(16000);
    // Bits per sample = 16
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
  });

  test('cleans up temp raw files (mic.raw, speaker.raw)', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-cleanup');

    recorderRefs.mic!.emitSilence(160);
    recorderRefs.sys!.emitSilence(160);

    await writer.stop(handle);

    expect(existsSync(join(tempDir, 'rec-cleanup', 'mic.raw'))).toBe(false);
    expect(existsSync(join(tempDir, 'rec-cleanup', 'speaker.raw'))).toBe(false);
  });

  test('returns correct RecordingResult shape', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-result');

    recorderRefs.mic!.emitSilence(16000); // 1 second of audio at 16kHz
    recorderRefs.sys!.emitSilence(16000);

    const result = await writer.stop(handle);

    expect(result.id).toBe('rec-result');
    expect(result.dir).toBe(join(tempDir, 'rec-result'));
    expect(result.file.name).toBe('recording.wav');
    expect(result.file.path).toBe(join(tempDir, 'rec-result', 'recording.wav'));
    expect(result.file.durationSecs).toBe(1);
  });

  test('duration calculation is correct based on samples written', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-duration');

    // Emit 2.5 seconds of audio (40000 samples at 16kHz)
    recorderRefs.mic!.emitSilence(40000);
    recorderRefs.sys!.emitSilence(40000);

    const result = await writer.stop(handle);
    expect(result.file.durationSecs).toBe(2.5);
  });

  test('second stop after first throws (recording removed from active map)', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-removed');

    recorderRefs.mic!.emitSilence(160);
    recorderRefs.sys!.emitSilence(160);

    await writer.stop(handle);

    // The handle is now removed, so a second stop should fail
    await expect(writer.stop(handle)).rejects.toThrow('No active recording');
  });
});

// ---------------------------------------------------------------------------
// discard()
// ---------------------------------------------------------------------------

describe('discard()', () => {
  test('throws if recording id is not found', async () => {
    const writer = new RecordingWriter(tempDir);
    const fakeHandle: RecordingHandle = {
      id: 'nonexistent',
      dir: join(tempDir, 'nonexistent'),
      startedAt: new Date(),
    };
    await expect(writer.discard(fakeHandle)).rejects.toThrow('No active recording');
  });

  test('is a no-op if recording was already stopped via stop()', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-already-stopped');

    recorderRefs.mic!.emitSilence(160);
    recorderRefs.sys!.emitSilence(160);

    await writer.stop(handle);

    // discard after stop should throw (no longer in map)
    await expect(writer.discard(handle)).rejects.toThrow('No active recording');
  });

  test('stops both native recorders', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-discard-recorders');

    const mic = recorderRefs.mic!;
    const sys = recorderRefs.sys!;

    await writer.discard(handle);

    expect(mic.stopped).toBe(true);
    expect(sys.stopped).toBe(true);
  });

  test('removes the entire recording directory', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-discard-dir');

    recorderRefs.mic!.emitSilence(160);
    recorderRefs.sys!.emitSilence(160);

    const recordingDir = join(tempDir, 'rec-discard-dir');
    expect(existsSync(recordingDir)).toBe(true);

    await writer.discard(handle);

    expect(existsSync(recordingDir)).toBe(false);
  });

  test('clears timers on discard', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir, { maxDurationSecs: 10 });
    const onError = vi.fn();
    const handle = await writer.start('rec-discard-timers', onError);

    await writer.discard(handle);

    // After discarding, no more errors should fire
    await new Promise((r) => setTimeout(r, 100));
    expect(onError).not.toHaveBeenCalled();
  });

  test('removes the recording from activeRecordings', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-discard-map');

    await writer.discard(handle);

    // Second discard should throw because it was removed from the map
    await expect(writer.discard(handle)).rejects.toThrow('No active recording');
  });
});

// ---------------------------------------------------------------------------
// WAV interleaving (tested indirectly via stop())
// ---------------------------------------------------------------------------

describe('interleaveToWav (via stop)', () => {
  test('zero-pads the shorter channel when files differ in length', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-unequal');

    // Mic has 16000 samples (1s), speaker has 32000 samples (2s)
    recorderRefs.mic!.emitSilence(16000);
    recorderRefs.sys!.emitSilence(32000);

    const result = await writer.stop(handle);

    // Duration should be based on the longer file
    expect(result.file.durationSecs).toBe(2);

    // WAV data size should be totalSamples * 4 (stereo int16)
    const wav = readFileSync(result.file.path);
    const dataSize = wav.readUInt32LE(40);
    expect(dataSize).toBe(32000 * 4);
  });

  test('clamps float samples to [-1, 1] range before converting to int16', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-clamp');

    // Emit out-of-range values
    recorderRefs.mic!.emitData([2.0, -2.0, 0.5]);
    recorderRefs.sys!.emitData([1.5, -1.5, -0.5]);

    const result = await writer.stop(handle);

    const wav = readFileSync(result.file.path);
    // Skip 44-byte WAV header, read interleaved int16 samples
    const dataOffset = 44;

    // Sample 0: mic=2.0 clamped to 1.0 -> 32767, sys=1.5 clamped to 1.0 -> 32767
    expect(wav.readInt16LE(dataOffset)).toBe(32767);
    expect(wav.readInt16LE(dataOffset + 2)).toBe(32767);

    // Sample 1: mic=-2.0 clamped to -1.0 -> -32767, sys=-1.5 clamped to -1.0 -> -32767
    expect(wav.readInt16LE(dataOffset + 4)).toBe(-32767);
    expect(wav.readInt16LE(dataOffset + 6)).toBe(-32767);

    // Sample 2: mic=0.5 -> 16384 (round(0.5*32767)), sys=-0.5 -> -16384
    expect(wav.readInt16LE(dataOffset + 8)).toBe(Math.round(0.5 * 32767));
    expect(wav.readInt16LE(dataOffset + 10)).toBe(Math.round(-0.5 * 32767));
  });

  test('correctly interleaves mic (left) and speaker (right) channels', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-interleave');

    // Emit known patterns: mic=0.25 for all, speaker=0.75 for all
    recorderRefs.mic!.emitData([0.25, 0.25]);
    recorderRefs.sys!.emitData([0.75, 0.75]);

    const result = await writer.stop(handle);

    const wav = readFileSync(result.file.path);
    const dataOffset = 44;

    const expectedMic = Math.round(0.25 * 32767);
    const expectedSys = Math.round(0.75 * 32767);

    // stereo int16: [micSample, sysSample, micSample, sysSample, ...]
    expect(wav.readInt16LE(dataOffset)).toBe(expectedMic);
    expect(wav.readInt16LE(dataOffset + 2)).toBe(expectedSys);
    expect(wav.readInt16LE(dataOffset + 4)).toBe(expectedMic);
    expect(wav.readInt16LE(dataOffset + 6)).toBe(expectedSys);
  });

  test('WAV header data size field matches actual audio data written', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-header-size');

    const sampleCount = 8000; // 0.5 seconds
    recorderRefs.mic!.emitSilence(sampleCount);
    recorderRefs.sys!.emitSilence(sampleCount);

    const result = await writer.stop(handle);

    const wav = readFileSync(result.file.path);
    const dataSize = wav.readUInt32LE(40);

    // Expected: sampleCount * 2 channels * 2 bytes per sample = sampleCount * 4
    expect(dataSize).toBe(sampleCount * 4);
    // Total file size should be header (44) + dataSize
    expect(wav.length).toBe(44 + dataSize);
  });

  test('handles empty files (both zero-length)', async () => {
    vi.useRealTimers();
    const writer = new RecordingWriter(tempDir);
    const handle = await writer.start('rec-empty');

    // Don't emit any audio data at all

    const result = await writer.stop(handle);

    expect(result.file.durationSecs).toBe(0);

    const wav = readFileSync(result.file.path);
    // Should just be a 44-byte header with 0 data size
    expect(wav.length).toBe(44);
    expect(wav.readUInt32LE(40)).toBe(0);
  });
});
