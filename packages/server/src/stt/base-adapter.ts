import type { AudioChunk, TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import type { STTConnection, STTTransport } from '@/stt/adapter-iface.js';
import type { BufferConfig, ReconnectConfig } from '@/stt/types.js';

const log = Log.create({ service: 'stt.base-adapter' });

type ManagedConnectionConfig = {
  buffer: BufferConfig;
  reconnect: ReconnectConfig;
  isFatal: (err: Error) => boolean;
  openConnection: () => Promise<STTTransport>;
};

type BufferedChunk = {
  chunk: AudioChunk;
  durationMs: number;
};

function chunkByteSize(chunk: AudioChunk): number {
  return Math.ceil((chunk.samplesB64.length * 3) / 4);
}

function chunkDurationMs(chunk: AudioChunk): number {
  return (chunk.numSamples / chunk.sampleRateHz) * 1000;
}

/**
 * Creates a managed STTConnection with bounded buffer, pacing, and reconnect/rotation.
 */
export async function createManagedConnection(
  config: ManagedConnectionConfig,
): Promise<STTConnection> {
  const { buffer: bufferConfig, reconnect: reconnectConfig, isFatal, openConnection } = config;

  const transcriptListeners: ((e: TranscriptEvent) => void)[] = [];
  const usageListeners: ((u: STTUsage) => void)[] = [];
  const errorListeners: ((err: Error) => void)[] = [];
  const closeListeners: (() => void)[] = [];

  // Bounded ring buffer for replay on reconnect
  const ringBuffer: BufferedChunk[] = [];
  let totalBufferedMs = 0;

  // Flush coalescing state
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingChunks: AudioChunk[] = [];
  let pendingBytes = 0;

  let transport: STTTransport | null = null;
  let closed = false;
  let reconnecting = false;
  let rotationTimer: ReturnType<typeof setTimeout> | null = null;

  function addToBuffer(chunk: AudioChunk): void {
    const duration = chunkDurationMs(chunk);
    ringBuffer.push({ chunk, durationMs: duration });
    totalBufferedMs += duration;

    while (totalBufferedMs > bufferConfig.maxBufferedMs && ringBuffer.length > 1) {
      const dropped = ringBuffer.shift()!;
      totalBufferedMs -= dropped.durationMs;
      log.warn('buffer overflow, dropping oldest chunk');
    }
  }

  function getReplayChunks(): AudioChunk[] {
    return ringBuffer.map((b) => b.chunk);
  }

  function clearBuffer(): void {
    ringBuffer.length = 0;
    totalBufferedMs = 0;
  }

  function wireTransport(conn: STTTransport): void {
    conn.onTranscript((e) => {
      for (const cb of transcriptListeners) cb(e);
    });
    conn.onUsage((u) => {
      for (const cb of usageListeners) cb(u);
    });
    conn.onError((err) => {
      if (closed) return;
      handleError(err);
    });
    conn.onClose(() => {
      if (closed) return;
      void handleDisconnect();
    });
  }

  function scheduleRotation(): void {
    if (!reconnectConfig.enabled || !reconnectConfig.rotateBeforeMs) return;

    rotationTimer = setTimeout(() => {
      if (closed) return;
      void proactiveRotate();
    }, reconnectConfig.rotateBeforeMs);
  }

  async function proactiveRotate(): Promise<void> {
    if (closed || reconnecting) return;
    reconnecting = true;

    log.info('proactive session rotation starting');

    const oldTransport = transport;
    oldTransport?.commit();

    try {
      const newTransport = await openConnection();
      transport = newTransport;
      wireTransport(newTransport);

      const replay = getReplayChunks();
      for (const chunk of replay) {
        newTransport.sendAudio(chunk);
      }

      await oldTransport?.close();
      scheduleRotation();
      log.info({ replayedChunks: replay.length }, 'proactive rotation complete');
    } catch (err) {
      log.error({ error: err }, 'proactive rotation failed, continuing on existing connection');
    } finally {
      reconnecting = false;
    }
  }

  async function handleDisconnect(): Promise<void> {
    if (closed || reconnecting) return;
    if (!reconnectConfig.enabled) {
      for (const cb of closeListeners) cb();
      return;
    }
    await reactiveReconnect();
  }

  function handleError(err: Error): void {
    if (isFatal(err)) {
      log.error({ error: err }, 'fatal adapter error, closing');
      for (const cb of errorListeners) cb(err);
      void close();
      return;
    }
    log.warn({ error: err }, 'transient adapter error');
  }

  async function reactiveReconnect(): Promise<void> {
    reconnecting = true;
    let attempt = 0;

    while (attempt < reconnectConfig.maxRetries && !closed) {
      attempt++;
      const delay =
        reconnectConfig.backoffMs * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5);
      log.info({ attempt, delay: Math.round(delay) }, 'reactive reconnect attempt');

      await new Promise((r) => setTimeout(r, delay));
      if (closed) break;

      try {
        const newTransport = await openConnection();
        transport = newTransport;
        wireTransport(newTransport);

        const replay = getReplayChunks();
        for (const chunk of replay) {
          newTransport.sendAudio(chunk);
        }

        scheduleRotation();
        log.info({ attempt, replayedChunks: replay.length }, 'reactive reconnect succeeded');
        reconnecting = false;
        return;
      } catch (err) {
        log.warn({ error: err, attempt }, 'reconnect attempt failed');
      }
    }

    reconnecting = false;
    if (!closed) {
      const error = new Error(`Reconnect failed after ${reconnectConfig.maxRetries} attempts`);
      for (const cb of errorListeners) cb(error);
      for (const cb of closeListeners) cb();
    }
  }

  function flushPending(): void {
    if (pendingChunks.length === 0 || !transport || closed) return;

    for (const chunk of pendingChunks) {
      transport.sendAudio(chunk);
    }

    pendingChunks = [];
    pendingBytes = 0;
    flushTimer = null;
  }

  function sendAudio(chunk: AudioChunk): void {
    if (closed) return;

    addToBuffer(chunk);

    const bytes = chunkByteSize(chunk);

    // If single chunk exceeds maxChunkBytes, send immediately
    if (bytes >= bufferConfig.maxChunkBytes) {
      if (pendingChunks.length > 0) flushPending();
      transport?.sendAudio(chunk);
      return;
    }

    pendingChunks.push(chunk);
    pendingBytes += bytes;

    // Flush if pending exceeds max chunk size
    if (pendingBytes >= bufferConfig.maxChunkBytes) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushPending();
      return;
    }

    // Schedule flush after interval
    if (!flushTimer) {
      flushTimer = setTimeout(flushPending, bufferConfig.flushIntervalMs);
    }
  }

  function commit(): void {
    if (closed) return;
    if (pendingChunks.length > 0) flushPending();
    transport?.commit();
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;

    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (rotationTimer) {
      clearTimeout(rotationTimer);
      rotationTimer = null;
    }

    if (pendingChunks.length > 0 && transport) {
      flushPending();
    }

    await transport?.close();
    clearBuffer();
  }

  // Initial connection
  transport = await openConnection();
  wireTransport(transport);
  scheduleRotation();

  return {
    sendAudio,
    commit,
    close,
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
  };
}
