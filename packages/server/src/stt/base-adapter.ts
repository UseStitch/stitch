import type { AudioChunk, TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import type { STTConnection, STTTransport } from '@/stt/adapter-iface.js';
import type { BufferConfig, PartialStrategy, ReconnectConfig } from '@/stt/types.js';

const log = Log.create({ service: 'stt.base-adapter' });

type ManagedConnectionConfig = {
  buffer: BufferConfig;
  reconnect: ReconnectConfig;
  partialStrategy: PartialStrategy;
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

export async function createManagedConnection(
  config: ManagedConnectionConfig,
): Promise<STTConnection> {
  const {
    buffer: bufferConfig,
    reconnect: reconnectConfig,
    partialStrategy,
    isFatal,
    openConnection,
  } = config;

  const maxBackoffMs = reconnectConfig.maxBackoffMs ?? 30_000;

  const transcriptListeners: ((e: TranscriptEvent) => void)[] = [];
  const usageListeners: ((u: STTUsage) => void)[] = [];
  const errorListeners: ((err: Error) => void)[] = [];
  const closeListeners: (() => void)[] = [];
  const unrecoverableListeners: ((reason: string) => void)[] = [];

  // Bounded ring buffer for replay on reconnect
  const ringBuffer: BufferedChunk[] = [];
  let totalBufferedMs = 0;

  // Flush coalescing state
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingChunks: AudioChunk[] = [];
  let pendingBytes = 0;

  // Partial accumulation for incremental providers
  let accumulatedPartial = '';

  let transport: STTTransport | null = null;
  let closed = false;
  let rotating = false;
  let reconnecting = false;
  let recoveryQueued = false;
  let rotationTimer: ReturnType<typeof setTimeout> | null = null;

  const sessionStartedAt = Date.now();
  let rotationCount = 0;

  function sessionAgeMs(): number {
    return Date.now() - sessionStartedAt;
  }

  function emitUnrecoverable(reason: string): void {
    log.error({ reason, rotationCount, sessionAgeMs: sessionAgeMs() }, 'connection unrecoverable');
    for (const cb of unrecoverableListeners) cb(reason);
    void close();
  }

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
      const normalized = normalizeTranscript(e);
      for (const cb of transcriptListeners) cb(normalized);
    });
    conn.onUsage((u) => {
      for (const cb of usageListeners) cb(u);
    });
    conn.onError((err) => {
      if (closed || conn !== transport) return;
      handleError(err);
    });
    conn.onClose(() => {
      if (closed || conn !== transport) return;
      void handleDisconnect();
    });
  }

  /**
   * Normalizes incremental partials into cumulative ones.
   * Resets on final events.
   */
  function normalizeTranscript(event: TranscriptEvent): TranscriptEvent {
    if (partialStrategy === 'cumulative') return event;

    if (event.kind === 'partial') {
      accumulatedPartial += event.text;
      return { ...event, text: accumulatedPartial };
    }

    // Final event — reset accumulation for the next utterance
    accumulatedPartial = '';
    return event;
  }

  function scheduleRotation(): void {
    if (!reconnectConfig.enabled || !reconnectConfig.rotateBeforeMs) return;

    if (rotationTimer) clearTimeout(rotationTimer);
    rotationTimer = setTimeout(() => {
      if (closed) return;
      void proactiveRotate();
    }, reconnectConfig.rotateBeforeMs);
  }

  async function proactiveRotate(): Promise<void> {
    if (closed || rotating || reconnecting) return;
    rotating = true;
    rotationCount++;

    log.info(
      {
        rotationCount,
        sessionAgeMs: sessionAgeMs(),
        pendingChunks: pendingChunks.length,
        pendingBytes,
        bufferedChunks: ringBuffer.length,
        totalBufferedMs: Math.round(totalBufferedMs),
      },
      'proactive session rotation starting',
    );

    const oldTransport = transport;
    flushPending();
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
      log.info({ rotationCount, replayedChunks: replay.length }, 'proactive rotation complete');
    } catch (err) {
      log.error({ error: err, rotationCount }, 'proactive rotation failed, retaining connection');
    } finally {
      rotating = false;
      scheduleRotation();
      if (recoveryQueued && !closed) {
        recoveryQueued = false;
        void reactiveReconnect();
      }
    }
  }

  async function handleDisconnect(): Promise<void> {
    if (closed) return;
    if (!reconnectConfig.enabled) {
      for (const cb of closeListeners) cb();
      return;
    }
    if (rotating || reconnecting) {
      recoveryQueued = true;
      log.warn({ rotating, reconnecting }, 'disconnect during recovery, deferring reconnect');
      return;
    }
    await reactiveReconnect();
  }

  function handleError(err: Error): void {
    if (isFatal(err)) {
      emitUnrecoverable(`fatal adapter error: ${err.message}`);
      for (const cb of errorListeners) cb(err);
      return;
    }
    log.warn({ error: err }, 'transient adapter error');
  }

  async function reactiveReconnect(): Promise<void> {
    if (reconnecting) return;
    reconnecting = true;
    let attempt = 0;
    const reconnectStartedAt = Date.now();

    while (!closed) {
      attempt++;
      const delay = Math.min(
        reconnectConfig.backoffMs * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5),
        maxBackoffMs,
      );
      log.info(
        { attempt, delay: Math.round(delay), elapsedMs: Date.now() - reconnectStartedAt },
        'reactive reconnect attempt',
      );

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
        if (isFatal(err instanceof Error ? err : new Error(String(err)))) {
          reconnecting = false;
          emitUnrecoverable(`fatal error during reconnect: ${String(err)}`);
          return;
        }
        log.warn({ error: err, attempt }, 'reconnect attempt failed');
      }
    }

    reconnecting = false;
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
    onUnrecoverable(cb) {
      unrecoverableListeners.push(cb);
    },
  };
}
