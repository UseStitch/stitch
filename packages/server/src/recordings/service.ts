import { and, desc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { createRecordingAnalysisId, createRecordingId, type PrefixedString } from '@stitch/shared/id';
import type {
  ActiveRecordingResponse,
  ListRecordingsResponse,
  Recording,
  RecordingDetailsResponse,
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingInput,
  StopRecordingResponse,
} from '@stitch/shared/recordings/types';

import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema/providers.js';
import { recordingAnalyses, recordings } from '@/db/schema/recordings.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { computeTotalPages } from '@/lib/paginated-query.js';
import { getModelDescriptor } from '@/models/stt/service.js';
import { startRecordingAnalysis, toRecordingAnalysis } from '@/recordings/analysis-service.js';
import { deleteRecordingFiles } from '@/recordings/file-store.js';
import { finalFlushAndCleanup } from '@/recordings/transcript-store.js';
import { getSettings } from '@/settings/service.js';

type RecordingRow = typeof recordings.$inferSelect;
type ActiveRecording = { id: Recording['id'] };

let activeRecording: ActiveRecording | null = null;
const log = Log.create({ service: 'recordings' });

type RecordingCaptureSettings = { inputDeviceId: string | null; outputDeviceId: string | null };

async function readCaptureSettings(): Promise<RecordingCaptureSettings> {
  const s = await getSettings(['recordings.inputDeviceId', 'recordings.outputDeviceId'] as const);
  return {
    inputDeviceId: s['recordings.inputDeviceId'] || null,
    outputDeviceId: s['recordings.outputDeviceId'] || null,
  };
}

type ResolvedSttConfig = { providerId: string; modelId: string; encoding: 'f32le' | 'pcm_s16le'; sampleRateHz: number };

async function resolveSttConfig(override?: { providerId: string; modelId: string }): Promise<ResolvedSttConfig | null> {
  let providerId: string;
  let modelId: string;

  if (override?.providerId && override.modelId) {
    providerId = override.providerId;
    modelId = override.modelId;
  } else {
    const s = await getSettings(['recordings.transcription.providerId', 'recordings.transcription.modelId'] as const);
    providerId = s['recordings.transcription.providerId'].trim();
    modelId = s['recordings.transcription.modelId'].trim();
  }

  if (!providerId || !modelId) {
    log.warn({ providerId, modelId }, 'transcription config missing providerId or modelId');
    return null;
  }

  const db = getDb();
  const config = (await db.select().from(providerConfig).where(eq(providerConfig.providerId, providerId))).at(0);

  if (!config) {
    log.warn({ providerId }, 'no provider config found for transcription provider');
    return null;
  }

  const model = await getModelDescriptor(providerId, modelId);
  if (!model) {
    log.warn({ providerId, modelId }, 'transcription model not found in STT registry');
    return null;
  }

  return { providerId, modelId, encoding: model.inputFormat.encoding, sampleRateHz: model.inputFormat.sampleRateHz };
}

function defaultTitle(): string {
  return new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function toRecording(
  row: RecordingRow,
  analysisTitle: string | null = null,
  analysisCostUsd: number | null = null,
): Recording {
  return {
    id: row.id,
    title: row.title,
    analysisTitle,
    source: row.source,
    status: row.status,
    platform: row.platform,
    durationMs: row.durationMs,
    costUsd: analysisCostUsd,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listRecordings(input: { page: number; pageSize: number }): Promise<ListRecordingsResponse> {
  const db = getDb();
  const offset = (input.page - 1) * input.pageSize;
  const [rows, total] = await Promise.all([
    db
      .select({
        recording: recordings,
        analysisTitle: recordingAnalyses.title,
        analysisCostUsd: recordingAnalyses.costUsd,
      })
      .from(recordings)
      .leftJoin(recordingAnalyses, eq(recordingAnalyses.recordingId, recordings.id))
      .orderBy(desc(recordings.createdAt))
      .limit(input.pageSize)
      .offset(offset),
    db.$count(recordings),
  ]);
  const totalPages = computeTotalPages(total, input.pageSize);

  return {
    recordings: rows.map((row) => toRecording(row.recording, row.analysisTitle || null, row.analysisCostUsd ?? null)),
    activeRecordingId: activeRecording?.id ?? null,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages,
  };
}

export async function getRecordingDetails(recordingId: Recording['id']): Promise<RecordingDetailsResponse> {
  const db = getDb();
  const row = (
    await db
      .select({
        recording: recordings,
        analysis: recordingAnalyses,
        analysisTitle: recordingAnalyses.title,
        analysisCostUsd: recordingAnalyses.costUsd,
      })
      .from(recordings)
      .leftJoin(recordingAnalyses, eq(recordingAnalyses.recordingId, recordings.id))
      .where(eq(recordings.id, recordingId))
  ).at(0);

  if (!row) {
    throw new HTTPException(404, { message: 'Recording not found' });
  }

  return {
    recording: toRecording(row.recording, row.analysisTitle || null, row.analysisCostUsd ?? null),
    analysis: row.analysis ? await toRecordingAnalysis(row.analysis) : null,
    activeRecordingId: activeRecording?.id ?? null,
  };
}

export function getActiveRecording(): ActiveRecordingResponse {
  return { activeRecordingId: activeRecording?.id ?? null };
}

export async function startRecording(input: StartRecordingInput): Promise<StartRecordingResponse> {
  if (activeRecording !== null) {
    throw new HTTPException(400, { message: 'Recording already in progress' });
  }

  const db = getDb();
  const id = createRecordingId();
  const now = Date.now();
  const title = input.title?.trim() || defaultTitle();
  let settings: RecordingCaptureSettings;
  let sttConfig: ResolvedSttConfig;

  try {
    const [resolvedSettings, resolvedSttConfig] = await Promise.all([
      readCaptureSettings(),
      resolveSttConfig(
        input.sttProviderId && input.sttModelId
          ? { providerId: input.sttProviderId, modelId: input.sttModelId }
          : undefined,
      ),
    ]);

    if (!resolvedSttConfig) {
      throw new HTTPException(400, { message: 'STT provider not configured for recordings' });
    }

    settings = resolvedSettings;
    sttConfig = resolvedSttConfig;

    await db
      .insert(recordings)
      .values({
        id,
        title,
        source: 'manual',
        status: 'recording',
        platform: input.platform ?? 'manual',
        startedAt: now,
      });

    // Create recording_analyses row upfront for later use by analysis
    const analysisId = createRecordingAnalysisId();
    await db
      .insert(recordingAnalyses)
      .values({
        id: analysisId,
        recordingId: id,
        status: 'pending',
        title: '',
        error: null,
        transcriptionProviderId: sttConfig.providerId,
        transcriptionModelId: sttConfig.modelId,
        analysisProviderId: null,
        analysisModelId: null,
        usage: null,
        costUsd: 0,
        startedAt: Date.now(),
        endedAt: null,
        durationMs: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

    activeRecording = { id };
    log.info(
      {
        recordingId: id,
        micDeviceId: settings.inputDeviceId,
        speakerDeviceId: settings.outputDeviceId,
        stt: { providerId: sttConfig.providerId, modelId: sttConfig.modelId },
      },
      'recording started',
    );
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    const message = Error.isError(error) ? error.message : 'Failed to start recording';
    throw new HTTPException(400, { message });
  }

  const row = (await db.select().from(recordings).where(eq(recordings.id, id))).at(0);
  if (!row) {
    throw new HTTPException(404, { message: 'Recording not found' });
  }

  internalBus.emit('recording.started', { recordingId: id });

  return {
    recording: toRecording(row),
    recordingId: id,
    micDeviceId: settings.inputDeviceId,
    speakerDeviceId: settings.outputDeviceId,
    audioChunkConfig: { encoding: sttConfig.encoding, sampleRateHz: sttConfig.sampleRateHz },
    stt: { providerId: sttConfig.providerId, modelId: sttConfig.modelId },
  };
}

export async function stopRecording(input: StopRecordingInput): Promise<StopRecordingResponse> {
  const current = activeRecording;
  if (!current) {
    throw new HTTPException(400, { message: 'No active recording' });
  }

  const db = getDb();
  activeRecording = null;

  try {
    const endedAt = Date.now();
    const durationMs = input.durationMs;

    await db
      .update(recordings)
      .set({ status: 'completed', endedAt, durationMs, updatedAt: Date.now() })
      .where(and(eq(recordings.id, current.id), eq(recordings.status, 'recording')));

    await db
      .update(recordingAnalyses)
      .set({ endedAt: Date.now(), durationMs: durationMs ?? undefined, updatedAt: Date.now() })
      .where(eq(recordingAnalyses.recordingId, current.id));

    // Final flush of in-memory transcript to the recordings directory
    await finalFlushAndCleanup(current.id);

    log.info({ recordingId: current.id }, 'recording stopped');

    const { 'recordings.autoAnalyze': autoAnalyze, 'recordings.analysis.defaultTemplateId': defaultTemplateId } =
      await getSettings(['recordings.autoAnalyze', 'recordings.analysis.defaultTemplateId'] as const);

    if (autoAnalyze) {
      void startRecordingAnalysis(current.id, { templateId: defaultTemplateId as PrefixedString<'mnt'> }).catch(
        (err) => {
          const message = Error.isError(err) ? err.message : String(err);
          log.warn({ recordingId: current.id, error: message }, 'auto analysis skipped');
        },
      );
    }
  } catch (error) {
    const message = Error.isError(error) ? error.message : 'Failed to stop recording';
    await db
      .update(recordings)
      .set({ status: 'failed', error: message, endedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(recordings.id, current.id));

    throw new HTTPException(400, { message });
  }

  const row = (await db.select().from(recordings).where(eq(recordings.id, current.id))).at(0);
  if (!row) {
    throw new HTTPException(404, { message: 'Recording not found' });
  }

  internalBus.emit('recording.stopped', { recordingId: current.id });

  return { recording: toRecording(row) };
}

export async function deleteRecording(recordingId: Recording['id']): Promise<void> {
  if (activeRecording?.id === recordingId) {
    throw new HTTPException(400, { message: 'Cannot delete an active recording' });
  }

  const db = getDb();
  const row = (await db.select().from(recordings).where(eq(recordings.id, recordingId))).at(0);

  if (!row) {
    throw new HTTPException(404, { message: 'Recording not found' });
  }

  await db.delete(recordings).where(eq(recordings.id, recordingId));
  await deleteRecordingFiles(recordingId);
}
