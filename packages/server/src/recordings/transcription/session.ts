import { eq } from 'drizzle-orm';

import type { RecordingTranscriptEntry } from '@stitch/shared/recordings/types';

import { getDb } from '@/db/client.js';
import { recordingAnalyses } from '@/db/schema/recordings.js';
import * as Events from '@/lib/events.js';
import * as Log from '@/lib/log.js';
import type { TranscriptionPricing } from '@/llm/provider/transcription-schema.js';
import {
  calculateDurationCostUsd,
  calculateTranscriptionCostUsd,
} from '@/recordings/transcription/cost.js';
import type { LiveTranscriptionUsage } from '@/recordings/transcription/provider-iface.js';
import { getTranscriptionProvider } from '@/recordings/transcription/registry.js';

const log = Log.create({ service: 'live-transcription' });

type LiveTranscriptionSessionConfig = {
  recordingId: string;
  analysisId: string;
  userName: string | null;
  providerId: string;
  modelId: string;
  apiKey: string;
  endpoint: string;
  sampleRateHz: number;
  pricing: TranscriptionPricing;
};

export type LiveTranscriptionSessionResult = {
  transcript: RecordingTranscriptEntry[];
  costUsd: number;
  usage: { mic: LiveTranscriptionUsage; speaker: LiveTranscriptionUsage };
};

export type LiveTranscriptionSession = {
  stop: () => Promise<LiveTranscriptionSessionResult>;
};

export async function startLiveTranscriptionSession(
  config: LiveTranscriptionSessionConfig,
): Promise<LiveTranscriptionSession> {
  const provider = getTranscriptionProvider(config.providerId);
  if (!provider) {
    throw new Error(`No live transcription provider for: ${config.providerId}`);
  }

  const connectionConfig = {
    apiKey: config.apiKey,
    endpoint: config.endpoint,
    modelId: config.modelId,
    sampleRateHz: config.sampleRateHz,
  };

  const [micConnection, speakerConnection] = await Promise.all([
    provider.connect(connectionConfig),
    provider.connect(connectionConfig),
  ]);

  const transcript: RecordingTranscriptEntry[] = [];
  let stopped = false;
  let stopping = false;
  let micChunkCount = 0;
  let speakerChunkCount = 0;

  // Usage tracking — Gemini sends cumulative totals in each usageMetadata message,
  // so we just keep the latest snapshot per connection.
  let micUsage: LiveTranscriptionUsage = {};
  let speakerUsage: LiveTranscriptionUsage = {};
  let currentCostUsd = 0;
  let persistTranscriptPromise: Promise<void> = Promise.resolve();
  const startedAt = Date.now();

  function computeTotalCost(): number {
    if (config.pricing.type === 'token') {
      const micCost = calculateTranscriptionCostUsd(micUsage, config.pricing);
      const speakerCost = calculateTranscriptionCostUsd(speakerUsage, config.pricing);
      return micCost + speakerCost;
    }
    // Duration-based: cost = elapsed minutes * perMinute * 2 (two connections)
    const elapsedMinutes = (Date.now() - startedAt) / 60_000;
    return calculateDurationCostUsd(elapsedMinutes * 2, config.pricing.perMinute);
  }

  function persistCostIncremental(): void {
    const newCost = computeTotalCost();
    if (newCost === currentCostUsd) return;
    currentCostUsd = newCost;

    // Fire-and-forget DB update
    const db = getDb();
    db.update(recordingAnalyses)
      .set({ costUsd: currentCostUsd, updatedAt: Date.now() })
      .where(eq(recordingAnalyses.id, config.analysisId as never))
      .catch((dbErr) => {
        log.warn(
          {
            error: dbErr instanceof Error ? dbErr.message : 'unknown',
            recordingId: config.recordingId,
          },
          'failed to persist incremental cost',
        );
      });
  }

  function persistTranscriptIncremental(): void {
    const transcriptSnapshot = [...transcript];

    persistTranscriptPromise = persistTranscriptPromise
      .then(async () => {
        const db = getDb();
        await db
          .update(recordingAnalyses)
          .set({ transcript: transcriptSnapshot, updatedAt: Date.now() })
          .where(eq(recordingAnalyses.id, config.analysisId as never));
      })
      .catch((dbErr) => {
        log.warn(
          {
            error: dbErr instanceof Error ? dbErr.message : 'unknown',
            recordingId: config.recordingId,
          },
          'failed to persist incremental transcript',
        );
      });
  }

  function handleUsage(source: 'mic' | 'speaker', usage: LiveTranscriptionUsage): void {
    if (stopped) return;

    if (source === 'mic') {
      micUsage = usage;
    } else {
      speakerUsage = usage;
    }

    persistCostIncremental();
  }

  function handleTranscript(source: 'mic' | 'speaker', text: string): void {
    if (stopped) return;

    const speaker = source === 'mic' ? (config.userName ?? 'You') : 'Them';
    const entry: RecordingTranscriptEntry = { speaker, content: text };
    transcript.push(entry);
    persistTranscriptIncremental();

    Events.emit('recording-transcript-entry', {
      recordingId: config.recordingId,
      source,
      speaker,
      content: text,
    });
  }

  micConnection.onTranscript((text) => handleTranscript('mic', text));
  speakerConnection.onTranscript((text) => handleTranscript('speaker', text));

  micConnection.onUsage((usage) => handleUsage('mic', usage));
  speakerConnection.onUsage((usage) => handleUsage('speaker', usage));

  function handleError(source: string, error: Error): void {
    log.error(
      { source, error: error.message, recordingId: config.recordingId },
      'transcription connection error',
    );
  }

  micConnection.onError((err) => handleError('mic', err));
  speakerConnection.onError((err) => handleError('speaker', err));

  // Send each chunk immediately (no buffering).
  const unsubscribe = Events.on('recording-audio-chunk', (payload) => {
    if (stopped || stopping || payload.recordingId !== config.recordingId) return;

    if (payload.source === 'mic') {
      micChunkCount += 1;
      micConnection.sendAudio(payload.samplesB64);
    } else {
      speakerChunkCount += 1;
      speakerConnection.sendAudio(payload.samplesB64);
    }
  });

  log.info(
    { recordingId: config.recordingId, providerId: config.providerId, modelId: config.modelId },
    'live transcription session started',
  );

  return {
    async stop(): Promise<LiveTranscriptionSessionResult> {
      if (stopped || stopping) {
        return {
          transcript,
          costUsd: currentCostUsd,
          usage: { mic: micUsage, speaker: speakerUsage },
        };
      }
      stopping = true;

      unsubscribe();

      // Wait for connections to close so the provider can flush final transcripts
      await Promise.all([micConnection.close(), speakerConnection.close()]);
      stopped = true;
      stopping = false;
      await persistTranscriptPromise;

      // Final cost computation
      currentCostUsd = computeTotalCost();

      log.info(
        {
          recordingId: config.recordingId,
          entries: transcript.length,
          micChunks: micChunkCount,
          speakerChunks: speakerChunkCount,
          costUsd: currentCostUsd,
        },
        'live transcription session stopped',
      );

      return {
        transcript,
        costUsd: currentCostUsd,
        usage: { mic: micUsage, speaker: speakerUsage },
      };
    },
  };
}
