import { randomUUID } from 'node:crypto';

import type {
  AudioChunk,
  AudioSource,
  CapabilityRequest,
  CapabilityResolution,
  STTUsage,
} from '@stitch/shared/stt/types';

import { getDb } from '@/db/client.js';
import { sttUsageEvents, type SttService } from '@/db/schema/usage.js';
import * as Log from '@/lib/log.js';
import { getModelDescriptor } from '@/models/stt/service.js';
import { getSettings } from '@/settings/service.js';
import type { STTConnection } from '@/stt/adapter-iface.js';
import { resolveSttAuth } from '@/stt/auth.js';
import { CapabilityNegotiationError, resolve } from '@/stt/capabilities.js';
import { calculateCost } from '@/stt/cost.js';
import {
  createDiarizationFallback,
  type DiarizationFallback,
} from '@/stt/fallbacks/diarization.js';
import { createVadFallback, type VadFallback } from '@/stt/fallbacks/vad.js';
import {
  createTranscriptOrderingBuffer,
  type SourcedTranscriptEvent,
} from '@/stt/ordering-buffer.js';
import { getAdapter } from '@/stt/registry.js';
import type { AudioResampler } from '@/stt/resampler.js';
import type { CommitStrategy, STTConnectionConfig } from '@/stt/types.js';

const log = Log.create({ service: 'stt.session' });

type STTSessionConfig = {
  sttSessionId: string;
  providerId: string;
  modelId: string;
  service: SttService;
  capabilityRequest: CapabilityRequest;
  language?: string;
  keyterms?: string[];
  inputEncoding: 'f32le' | 'pcm_s16le';
  inputSampleRateHz: number;
};

export type STTSessionResult = {
  costUsd: number;
  usage: STTUsage;
  capabilityResolution: CapabilityResolution;
};

export type STTSession = {
  readonly sttSessionId: string;
  readonly capabilityResolution: CapabilityResolution;
  feedAudio(source: AudioSource, chunk: AudioChunk): void;
  commit(): void;
  stop(): Promise<STTSessionResult>;
  onTranscript(cb: (e: SourcedTranscriptEvent) => void): void;
  onError(cb: (err: Error) => void): void;
  onUnrecoverable(cb: (reason: string) => void): void;
};

type STTSessionDeps = {
  resampler: AudioResampler;
};

export class STTSessionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'STTSessionError';
  }
}

export async function createSTTSession(
  config: STTSessionConfig,
  deps: STTSessionDeps,
): Promise<STTSession> {
  const { sttSessionId, providerId, modelId, service, capabilityRequest, language, keyterms } =
    config;

  log.info({ sttSessionId, providerId, modelId }, 'creating STT session');

  // Resolve adapter
  const adapter = getAdapter(providerId);
  if (!adapter) {
    throw new STTSessionError(`Unknown STT provider: ${providerId}`, 'unknown_provider');
  }

  // Resolve model
  const maybeModel = await getModelDescriptor(providerId, modelId);
  if (!maybeModel) {
    throw new STTSessionError(`Unknown STT model: ${modelId}`, 'unknown_model');
  }
  const model = maybeModel;

  // Negotiate capabilities
  let capabilityResolution: CapabilityResolution;
  try {
    capabilityResolution = resolve(capabilityRequest, model.capabilities);
  } catch (err) {
    if (err instanceof CapabilityNegotiationError) {
      throw new STTSessionError(err.message, 'capability_unsatisfied');
    }
    throw err;
  }

  // Resolve auth
  const auth = await resolveSttAuth(providerId);
  if (!auth) {
    throw new STTSessionError(
      `No credentials configured for provider: ${providerId}`,
      'no_credentials',
    );
  }

  // Determine commit strategy
  const commitStrategy: CommitStrategy =
    capabilityResolution.satisfied.native_vad === 'native' ? 'native_vad' : 'manual';

  // Setup fallbacks
  let vadFallback: VadFallback | null = null;
  if (commitStrategy === 'manual' && capabilityResolution.satisfied.native_vad === 'fallback') {
    vadFallback = createVadFallback();
  }

  let diarizationFallback: DiarizationFallback | null = null;
  if (capabilityResolution.satisfied.diarization !== 'unsupported') {
    const { 'profile.name': profileName } = await getSettings(['profile.name'] as const);
    const micName = profileName.trim() || 'You';

    diarizationFallback = createDiarizationFallback({
      micSpeakerName: micName,
      speakerSpeakerName: 'Them',
    });
  }

  const useDualStream = diarizationFallback !== null;

  // Build connection config
  const connectionConfig: STTConnectionConfig = {
    modelId,
    auth,
    inputFormat: model.inputFormat,
    language,
    capabilities: capabilityResolution,
    commitStrategy,
    partialStrategy: model.partialStrategy,
    buffer: model.buffer,
    reconnect: model.reconnect,
    keyterms,
  };

  // Open connections eagerly
  const transcriptListeners: ((e: SourcedTranscriptEvent) => void)[] = [];
  const errorListeners: ((err: Error) => void)[] = [];
  const unrecoverableListeners: ((reason: string) => void)[] = [];

  const connections = new Map<AudioSource, STTConnection>();

  // Usage tracking
  const startedAt = Date.now();
  let totalUsage: STTUsage = { durationMs: 0 };

  // Ordering buffer: collects events from both streams and emits in offsetMs order
  const orderingBuffer = createTranscriptOrderingBuffer((event) => {
    for (const cb of transcriptListeners) cb(event);
  });

  function wireConnection(conn: STTConnection, source: AudioSource): void {
    conn.onTranscript((evt) => {
      let tagged = evt;
      if (diarizationFallback) {
        tagged = diarizationFallback.tagTranscript(evt, source);
      }
      // Route through the ordering buffer with source attached
      const sourcedEvent: SourcedTranscriptEvent = { ...tagged, source };
      orderingBuffer.push(sourcedEvent);
    });

    conn.onUsage((usage) => {
      totalUsage.durationMs = Math.max(totalUsage.durationMs, usage.durationMs);
      if (usage.audioInputTokens) {
        totalUsage.audioInputTokens = (totalUsage.audioInputTokens ?? 0) + usage.audioInputTokens;
      }
      if (usage.textOutputTokens) {
        totalUsage.textOutputTokens = (totalUsage.textOutputTokens ?? 0) + usage.textOutputTokens;
      }
    });

    conn.onError((err) => {
      for (const cb of errorListeners) cb(err);
    });

    conn.onUnrecoverable((reason) => {
      for (const cb of unrecoverableListeners) cb(reason);
    });
  }

  // Open all connections eagerly to avoid race conditions with lazy opens
  if (useDualStream) {
    const [micConn, speakerConn] = await Promise.all([
      adapter.connect(connectionConfig),
      adapter.connect(connectionConfig),
    ]);
    connections.set('mic', micConn);
    connections.set('speaker', speakerConn);
    wireConnection(micConn, 'mic');
    wireConnection(speakerConn, 'speaker');
  } else {
    const primaryConn = await adapter.connect(connectionConfig);
    connections.set('mic', primaryConn);
    wireConnection(primaryConn, 'mic');
  }

  function feedAudio(source: AudioSource, chunk: AudioChunk): void {
    const converted = deps.resampler.convert(chunk, model.inputFormat);

    const conn = useDualStream ? connections.get(source) : connections.get('mic');
    if (!conn) return;

    conn.sendAudio(converted);

    if (vadFallback) {
      const shouldCommit = vadFallback.processChunk(converted);
      if (shouldCommit) {
        conn.commit();
      }
    }
  }

  function commit(): void {
    for (const conn of connections.values()) {
      conn.commit();
    }
  }

  async function stop(): Promise<STTSessionResult> {
    const allConns = [...connections.values()];
    const COMMIT_DRAIN_TIMEOUT_MS = 5000;

    await Promise.all(
      allConns.map((conn) => {
        return new Promise<void>((resolvePromise) => {
          const timer = setTimeout(() => {
            log.warn({ sttSessionId }, 'timed out waiting for committed_transcript after commit');
            resolvePromise();
          }, COMMIT_DRAIN_TIMEOUT_MS);

          conn.onTranscript((evt) => {
            if (evt.kind === 'final') {
              clearTimeout(timer);
              resolvePromise();
            }
          });

          conn.commit();
        }).then(() => conn.close());
      }),
    );

    // Drain any remaining buffered events before reporting done
    orderingBuffer.drain();

    const costUsd = calculateCost(model.pricing, totalUsage);
    const endedAt = Date.now();

    const db = getDb();
    await db.insert(sttUsageEvents).values({
      id: randomUUID(),
      providerId,
      modelId,
      service,
      costUsd,
      rawData: totalUsage,
      startedAt,
      endedAt,
    });

    log.info(
      { sttSessionId, providerId, modelId, costUsd, durationMs: totalUsage.durationMs },
      'session stopped',
    );

    return { costUsd, usage: totalUsage, capabilityResolution };
  }

  return {
    sttSessionId,
    capabilityResolution,
    feedAudio,
    commit,
    stop,
    onTranscript(cb) {
      transcriptListeners.push(cb);
    },
    onError(cb) {
      errorListeners.push(cb);
    },
    onUnrecoverable(cb) {
      unrecoverableListeners.push(cb);
    },
  };
}
