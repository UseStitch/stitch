import type { AudioChunk, TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import type { STTConnection } from '@/stt/adapter-iface.js';
import type { BufferConfig, ReconnectConfig } from '@/stt/types.js';

const log = Log.create({ service: 'stt.base-adapter' });

type TranscriptListener = (e: TranscriptEvent) => void;
type UsageListener = (u: STTUsage) => void;
type ErrorListener = (err: Error) => void;
type CloseListener = () => void;

export type RawConnection = {
  send(chunk: AudioChunk): void;
  commit(): void;
  close(): Promise<void>;
  onTranscript(cb: TranscriptListener): void;
  onUsage(cb: UsageListener): void;
  onError(cb: ErrorListener): void;
  onClose(cb: CloseListener): void;
};

type BaseAdapterConfig = {
  buffer: BufferConfig;
  reconnect: ReconnectConfig;
  isFatal: (err: Error) => boolean;
  openConnection: () => Promise<RawConnection>;
};

type BufferedChunk = {
  chunk: AudioChunk;
  timestampMs: number;
  byteSize: number;
};

function chunkByteSize(chunk: AudioChunk): number {
  // base64 -> raw bytes: ~3/4 ratio
  return Math.ceil((chunk.samplesB64.length * 3) / 4);
}

/**
 * Creates a managed STTConnection with bounded buffer, pacing, and reconnect/rotation.
 */
export async function createManagedConnection(config: BaseAdapterConfig): Promise<STTConnection> {
  const { buffer: bufferConfig, reconnect: reconnectConfig, isFatal, openConnection } = config;

  const transcriptListeners: TranscriptListener[] = [];
  const usageListeners: UsageListener[] = [];
  const errorListeners: ErrorListener[] = [];
  const closeListeners: CloseListener[] = [];

  // Bounded ring buffer
  const ringBuffer: BufferedChunk[] = [];
  let totalBufferedMs = 0;

  // Flush coalescing state
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingChunks: AudioChunk[] = [];
  let pendingBytes = 0;

  let connection: RawConnection | null = null;
  let closed = false;
  let reconnecting = false;
  let rotationTimer: ReturnType<typeof setTimeout> | null = null;

  function addToBuffer(chunk: AudioChunk): void {
    const byteSize = chunkByteSize(chunk);
    const chunkDurationMs = (chunk.numSamples / chunk.sampleRateHz) * 1000;

    ringBuffer.push({ chunk, timestampMs: Date.now(), byteSize });
    totalBufferedMs += chunkDurationMs;

    // Enforce max buffered duration — drop oldest
    while (totalBufferedMs > bufferConfig.maxBufferedMs && ringBuffer.length > 1) {
      const dropped = ringBuffer.shift()!;
      const droppedDurationMs = (dropped.chunk.numSamples / dropped.chunk.sampleRateHz) * 1000;
      totalBufferedMs -= droppedDurationMs;
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

  function wireConnection(conn: RawConnection): void {
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

    const rotateAt = reconnectConfig.rotateBeforeMs;
    rotationTimer = setTimeout(() => {
      if (closed) return;
      void proactiveRotate();
    }, rotateAt);
  }

  async function proactiveRotate(): Promise<void> {
    if (closed || reconnecting) return;
    reconnecting = true;

    log.info('proactive session rotation starting');

    const oldConn = connection;
    // Force a commit on the old connection for a clean final at the seam
    oldConn?.commit();

    try {
      const newConn = await openConnection();
      connection = newConn;
      wireConnection(newConn);

      // Replay buffered audio onto new connection
      const replay = getReplayChunks();
      for (const chunk of replay) {
        newConn.send(chunk);
      }

      // Close old connection after new one is ready
      await oldConn?.close();
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
        const newConn = await openConnection();
        connection = newConn;
        wireConnection(newConn);

        // Replay buffered audio
        const replay = getReplayChunks();
        for (const chunk of replay) {
          newConn.send(chunk);
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
    if (pendingChunks.length === 0 || !connection || closed) return;

    // Coalesce into chunks respecting maxChunkBytes
    let currentBatch: AudioChunk[] = [];
    let currentBytes = 0;

    for (const chunk of pendingChunks) {
      const bytes = chunkByteSize(chunk);
      if (currentBytes + bytes > bufferConfig.maxChunkBytes && currentBatch.length > 0) {
        // Send current batch as individual chunks (provider handles framing)
        for (const c of currentBatch) {
          connection.send(c);
        }
        currentBatch = [];
        currentBytes = 0;
      }
      currentBatch.push(chunk);
      currentBytes += bytes;
    }

    // Send remaining
    for (const c of currentBatch) {
      connection.send(c);
    }

    pendingChunks = [];
    pendingBytes = 0;
    flushTimer = null;
  }

  function sendAudio(chunk: AudioChunk): void {
    if (closed) return;

    addToBuffer(chunk);

    const bytes = chunkByteSize(chunk);

    // If single chunk exceeds maxChunkBytes, send immediately (adapter will handle splitting)
    if (bytes >= bufferConfig.maxChunkBytes) {
      // Flush any pending first
      if (pendingChunks.length > 0) flushPending();
      connection?.send(chunk);
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
    // Flush pending audio first
    if (pendingChunks.length > 0) flushPending();
    connection?.commit();
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

    // Flush any remaining audio
    if (pendingChunks.length > 0 && connection) {
      flushPending();
    }

    await connection?.close();
    clearBuffer();
  }

  // Initial connection
  connection = await openConnection();
  wireConnection(connection);
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
