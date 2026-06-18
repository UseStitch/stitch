import { describe, expect, test } from 'bun:test';

import type { AudioChunk, STTUsage, TranscriptEvent } from '@stitch/shared/stt/types';

import type { STTTransport } from '@/stt/adapter-iface.js';
import { createManagedConnection } from '@/stt/base-adapter.js';
import type { BufferConfig, ReconnectConfig } from '@/stt/types.js';

function makeChunk(index: number): AudioChunk {
  // 1600 samples @ 16kHz = 100ms. samplesB64 carries the index so received order is checkable.
  return {
    samplesB64: `chunk-${index}`,
    sampleRateHz: 16_000,
    numSamples: 1600,
    encoding: 'pcm_s16le',
  };
}

type FakeTransport = STTTransport & {
  received: AudioChunk[];
  closed: boolean;
  emitTranscript: (e: TranscriptEvent) => void;
  emitClose: () => void;
  emitError: (err: Error) => void;
};

function createFakeTransport(): FakeTransport {
  const transcriptListeners: ((e: TranscriptEvent) => void)[] = [];
  const usageListeners: ((u: STTUsage) => void)[] = [];
  const errorListeners: ((err: Error) => void)[] = [];
  const closeListeners: (() => void)[] = [];
  const received: AudioChunk[] = [];

  const transport: FakeTransport = {
    received,
    closed: false,
    sendAudio(chunk) {
      if (transport.closed) return;
      received.push(chunk);
    },
    commit() {},
    async close() {
      transport.closed = true;
    },
    onTranscript(cb) {
      transcriptListeners.push(cb);
    },
    onUsage(cb) {
      usageListeners.push(cb);
    },
    onError(cb) {
      errorListeners.push(cb);
    },
    onClose(cb) {
      closeListeners.push(cb);
    },
    emitTranscript(e) {
      for (const cb of transcriptListeners) cb(e);
    },
    emitClose() {
      transport.closed = true;
      for (const cb of closeListeners) cb();
    },
    emitError(err) {
      for (const cb of errorListeners) cb(err);
    },
  };

  return transport;
}

const baseBuffer: BufferConfig = {
  maxChunkBytes: 1, // flush every chunk immediately so order is deterministic
  flushIntervalMs: 5,
  maxBufferedMs: 10 * 60 * 1000, // large so nothing is dropped in tests
  paceRealtime: false,
};

const baseReconnect: ReconnectConfig = {
  enabled: true,
  maxRetries: 3,
  backoffMs: 1,
  maxBackoffMs: 4,
  rotateBeforeMs: 10,
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('createManagedConnection recovery', () => {
  test('recovers when the new transport drops mid-rotation (no permanent wedge)', async () => {
    const transports: FakeTransport[] = [];
    const conn = await createManagedConnection({
      buffer: baseBuffer,
      reconnect: baseReconnect,
      partialStrategy: 'cumulative',
      classifyError: () => ({ fatal: false }),
      openConnection: async () => {
        const t = createFakeTransport();
        transports.push(t);
        return t;
      },
    });

    // Wait for the first proactive rotation to occur, then kill the new transport.
    await sleep(30);
    const live = transports[transports.length - 1];
    live.emitClose();

    // Allow reactive reconnect to open a fresh transport.
    await sleep(50);

    const finalTransport = transports[transports.length - 1];
    expect(finalTransport.closed).toBe(false);

    // Audio sent after recovery must reach the live transport.
    conn.sendAudio(makeChunk(999));
    await sleep(20);
    expect(finalTransport.received.some((c) => c.samplesB64 === 'chunk-999')).toBe(true);

    await conn.close();
  });

  test('re-arms rotation after a failed proactive rotation', async () => {
    let openCount = 0;
    const transports: FakeTransport[] = [];
    const conn = await createManagedConnection({
      buffer: baseBuffer,
      reconnect: baseReconnect,
      partialStrategy: 'cumulative',
      classifyError: () => ({ fatal: false }),
      openConnection: async () => {
        openCount++;
        // Fail the first rotation attempt (2nd open) once.
        if (openCount === 2) {
          throw new Error('transient open failure');
        }
        const t = createFakeTransport();
        transports.push(t);
        return t;
      },
    });

    // First rotation fails; rotation must still re-arm and eventually succeed.
    await sleep(60);
    expect(openCount).toBeGreaterThanOrEqual(3);

    await conn.close();
  });

  test('reconnects indefinitely past maxRetries until success (option A)', async () => {
    let openCount = 0;
    const transports: FakeTransport[] = [];
    const conn = await createManagedConnection({
      buffer: { ...baseBuffer },
      reconnect: { ...baseReconnect, rotateBeforeMs: undefined, maxRetries: 2 },
      partialStrategy: 'cumulative',
      classifyError: () => ({ fatal: false }),
      openConnection: async () => {
        openCount++;
        // Initial open succeeds; then fail more times than maxRetries before succeeding.
        if (openCount > 1 && openCount <= 5) {
          throw new Error('still down');
        }
        const t = createFakeTransport();
        transports.push(t);
        return t;
      },
    });

    // Drop the initial transport to trigger reactive reconnect.
    transports[0].emitClose();

    // maxRetries is 2 but we fail 4 times — indefinite retry must keep going.
    await sleep(120);
    expect(openCount).toBeGreaterThan(5);
    expect(transports[transports.length - 1].closed).toBe(false);

    await conn.close();
  });

  test('does not lose audio across rotations (flush before rotate)', async () => {
    const transports: FakeTransport[] = [];
    const conn = await createManagedConnection({
      buffer: { ...baseBuffer, maxChunkBytes: 1_000_000, flushIntervalMs: 1000 }, // force pending
      reconnect: baseReconnect,
      partialStrategy: 'cumulative',
      classifyError: () => ({ fatal: false }),
      openConnection: async () => {
        const t = createFakeTransport();
        transports.push(t);
        return t;
      },
    });

    // Queue chunks that sit in the pending buffer (not yet flushed by size/time).
    const total = 5;
    for (let i = 0; i < total; i++) {
      conn.sendAudio(makeChunk(i));
    }

    // Trigger rotation while chunks are pending; flush-before-rotate must preserve them.
    await sleep(40);
    await conn.close();

    const allReceived = new Set(transports.flatMap((t) => t.received.map((c) => c.samplesB64)));
    for (let i = 0; i < total; i++) {
      expect(allReceived.has(`chunk-${i}`)).toBe(true);
    }
  });

  test('emits unrecoverable once when reconnect hits a fatal open error', async () => {
    let openCount = 0;
    const transports: FakeTransport[] = [];
    const conn = await createManagedConnection({
      buffer: baseBuffer,
      reconnect: { ...baseReconnect, rotateBeforeMs: undefined },
      partialStrategy: 'cumulative',
      classifyError: (err) =>
        err.message.includes('FATAL')
          ? { fatal: true, reason: 'adapter classified auth as fatal' }
          : { fatal: false },
      openConnection: async () => {
        openCount++;
        if (openCount === 1) {
          const t = createFakeTransport();
          transports.push(t);
          return t;
        }
        throw new Error('FATAL auth rejected');
      },
    });

    const reasons: string[] = [];
    conn.onUnrecoverable((reason) => reasons.push(reason));

    // Drop the only transport: reactive reconnect runs, its open throws a fatal error.
    transports[0].emitClose();

    await sleep(40);

    expect(reasons.length).toBe(1);
    expect(reasons[0]).toBe('adapter classified auth as fatal');

    await conn.close();
  });
});
