import { eq } from 'drizzle-orm';

import type {
  AudioChunk,
  AudioSource,
  CapabilityRequest,
  CapabilityResolution,
  STTUsage,
  TranscriptEvent,
} from '@stitch/shared/stt/types';

import { getDb } from '@/db/client.js';
import { userSettings } from '@/db/schema/settings.js';
import * as Log from '@/lib/log.js';
import type { STTConnection } from '@/stt/adapter-iface.js';
import { resolveSttAuth } from '@/stt/auth.js';
import { CapabilityNegotiationError, resolve } from '@/stt/capabilities.js';
import { calculateCost } from '@/stt/cost.js';
import {
  createDiarizationFallback,
  type DiarizationFallback,
} from '@/stt/fallbacks/diarization.js';
import { createVadFallback, type VadFallback } from '@/stt/fallbacks/vad.js';
import { getAdapter, getModelDescriptor } from '@/stt/registry.js';
import type { AudioResampler } from '@/stt/resampler.js';
import type { CommitStrategy, STTConnectionConfig } from '@/stt/types.js';

const log = Log.create({ service: 'stt.session' });

type STTSessionConfig = {
  sttSessionId: string;
  providerId: string;
  modelId: string;
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
  onTranscript(cb: (e: TranscriptEvent) => void): void;
  onError(cb: (err: Error) => void): void;
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
  const { sttSessionId, providerId, modelId, capabilityRequest, language, keyterms } = config;

  // Resolve adapter
  const maybeAdapter = getAdapter(providerId);
  if (!maybeAdapter) {
    throw new STTSessionError(`Unknown STT provider: ${providerId}`, 'unknown_provider');
  }
  const adapter = maybeAdapter;

  // Resolve model
  const maybeModel = getModelDescriptor(providerId, modelId);
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
    const db = getDb();
    const [row] = await db
      .select({ value: userSettings.value })
      .from(userSettings)
      .where(eq(userSettings.key, 'profile.name'));
    const micName = row?.value?.trim() || 'You';

    diarizationFallback = createDiarizationFallback({
      micSpeakerName: micName,
      speakerSpeakerName: 'Them',
    });
  }

  // Build connection config
  const connectionConfig: STTConnectionConfig = {
    modelId,
    auth,
    inputFormat: model.inputFormat,
    language,
    capabilities: capabilityResolution,
    commitStrategy,
    buffer: model.buffer,
    reconnect: model.reconnect,
    keyterms,
  };

  // Open connections — one per source if diarization fallback is active
  const connections = new Map<AudioSource, STTConnection>();
  const transcriptListeners: ((e: TranscriptEvent) => void)[] = [];
  const errorListeners: ((err: Error) => void)[] = [];

  // For single-stream mode, use one connection for all sources
  const useDualStream = diarizationFallback !== null;
  let primaryConnection: STTConnection | null = null;

  // Usage tracking
  let totalUsage: STTUsage = { durationMs: 0 };

  async function openConnectionForSource(source: AudioSource): Promise<STTConnection> {
    const conn = await adapter.connect(connectionConfig);

    conn.onTranscript((evt) => {
      let tagged = evt;
      if (diarizationFallback) {
        tagged = diarizationFallback.tagTranscript(evt, source);
      }
      for (const cb of transcriptListeners) cb(tagged);
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

    return conn;
  }

  // Open the primary connection eagerly
  if (!useDualStream) {
    primaryConnection = await openConnectionForSource('mic');
  }

  function feedAudio(source: AudioSource, chunk: AudioChunk): void {
    // Convert to the adapter's required format
    const converted = deps.resampler.convert(chunk, model.inputFormat);

    let conn: STTConnection | null | undefined;

    if (useDualStream) {
      conn = connections.get(source);
      if (!conn) {
        // Lazily open connection for this source
        openConnectionForSource(source)
          .then((c) => {
            connections.set(source, c);
            c.sendAudio(converted);
          })
          .catch((err) => {
            for (const cb of errorListeners)
              cb(err instanceof Error ? err : new Error(String(err)));
          });
        return;
      }
    } else {
      conn = primaryConnection;
    }

    if (!conn) return;
    conn.sendAudio(converted);

    // VAD fallback: detect turn boundaries and trigger commit
    if (vadFallback) {
      const shouldCommit = vadFallback.processChunk(converted);
      if (shouldCommit) {
        conn.commit();
      }
    }
  }

  function commit(): void {
    if (useDualStream) {
      for (const conn of connections.values()) {
        conn.commit();
      }
    } else {
      primaryConnection?.commit();
    }
  }

  async function stop(): Promise<STTSessionResult> {
    // Close all connections
    const allConns = useDualStream
      ? [...connections.values()]
      : primaryConnection
        ? [primaryConnection]
        : [];

    await Promise.all(allConns.map((c) => c.close()));

    const costUsd = calculateCost(model.pricing, totalUsage);

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
  };
}
