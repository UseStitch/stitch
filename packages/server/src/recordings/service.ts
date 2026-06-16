import { and, desc, eq, sql } from 'drizzle-orm';

import {
  createRecordingAnalysisId,
  createRecordingId,
  type PrefixedString,
} from '@stitch/shared/id';
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
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { getModelDescriptor } from '@/models/stt/service.js';
import { startRecordingAnalysis, toRecordingAnalysis } from '@/recordings/analysis-service.js';
import { deleteRecordingFiles } from '@/recordings/file-store.js';
import { finalFlushAndCleanup } from '@/recordings/transcript-store.js';
import { getSettings } from '@/settings/service.js';

type RecordingRow = typeof recordings.$inferSelect;
type ActiveRecording = {
  id: Recording['id'];
};

let activeRecording: ActiveRecording | null = null;
const log = Log.create({ service: 'recordings' });

type RecordingCaptureSettings = {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  speakerGain: number;
};

async function readCaptureSettings(): Promise<RecordingCaptureSettings> {
  const s = await getSettings([
    'recordings.inputDeviceId',
    'recordings.outputDeviceId',
    'recordings.speakerGain',
  ] as const);
  return {
    inputDeviceId: s['recordings.inputDeviceId'] || null,
    outputDeviceId: s['recordings.outputDeviceId'] || null,
    speakerGain: s['recordings.speakerGain'],
  };
}

type ResolvedSttConfig = {
  providerId: string;
  modelId: string;
  encoding: 'f32le' | 'pcm_s16le';
  sampleRateHz: number;
};

async function resolveSttConfig(override?: {
  providerId: string;
  modelId: string;
}): Promise<ResolvedSttConfig | null> {
  let providerId: string;
  let modelId: string;

  if (override?.providerId && override?.modelId) {
    providerId = override.providerId;
    modelId = override.modelId;
  } else {
    const s = await getSettings([
      'recordings.transcription.providerId',
      'recordings.transcription.modelId',
    ] as const);
    providerId = s['recordings.transcription.providerId'].trim();
    modelId = s['recordings.transcription.modelId'].trim();
  }

  if (!providerId || !modelId) {
    log.warn({ providerId, modelId }, 'transcription config missing providerId or modelId');
    return null;
  }

  const db = getDb();
  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));

  if (!config) {
    log.warn({ providerId }, 'no provider config found for transcription provider');
    return null;
  }

  const model = await getModelDescriptor(providerId, modelId);
  if (!model) {
    log.warn({ providerId, modelId }, 'transcription model not found in STT registry');
    return null;
  }

  return {
    providerId,
    modelId,
    encoding: model.inputFormat.encoding,
    sampleRateHz: model.inputFormat.sampleRateHz,
  };
}

function defaultTitle(): string {
  const now = new Date();
  const month = now.toLocaleDateString(undefined, { month: 'short' });
  const day = now.getDate();
  const year = now.getFullYear();
  const timePart = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return `${month} ${day} ${year} ${timePart}`;
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

export async function listRecordings(input: {
  page: number;
  pageSize: number;
}): Promise<ListRecordingsResponse> {
  const db = getDb();
  const offset = (input.page - 1) * input.pageSize;
  const [rows, countRows] = await Promise.all([
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
    db.select({ total: sql<number>`count(*)` }).from(recordings),
  ]);
  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = computeTotalPages(total, input.pageSize);

  return {
    recordings: rows.map((row) =>
      toRecording(row.recording, row.analysisTitle || null, row.analysisCostUsd ?? null),
    ),
    activeRecordingId: activeRecording?.id ?? null,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages,
  };
}

export async function getRecordingDetails(
  recordingId: Recording['id'],
): Promise<ServiceResult<RecordingDetailsResponse>> {
  const db = getDb();
  const [row] = await db
    .select({
      recording: recordings,
      analysis: recordingAnalyses,
      analysisTitle: recordingAnalyses.title,
      analysisCostUsd: recordingAnalyses.costUsd,
    })
    .from(recordings)
    .leftJoin(recordingAnalyses, eq(recordingAnalyses.recordingId, recordings.id))
    .where(eq(recordings.id, recordingId));

  if (!row) {
    return err('Recording not found', 404);
  }

  return ok({
    recording: toRecording(row.recording, row.analysisTitle || null, row.analysisCostUsd ?? null),
    analysis: row.analysis ? await toRecordingAnalysis(row.analysis) : null,
    activeRecordingId: activeRecording?.id ?? null,
  });
}

export function getActiveRecording(): ActiveRecordingResponse {
  return { activeRecordingId: activeRecording?.id ?? null };
}

export async function startRecording(
  input: StartRecordingInput,
): Promise<ServiceResult<StartRecordingResponse>> {
  if (activeRecording !== null) {
    return err('Recording already in progress', 400);
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
      return err('STT provider not configured for recordings', 400);
    }

    settings = resolvedSettings;
    sttConfig = resolvedSttConfig;

    await db.insert(recordings).values({
      id,
      title,
      source: 'manual',
      status: 'recording',
      platform: input.platform ?? 'manual',
      startedAt: now,
    });

    // Create recording_analyses row upfront for later use by analysis
    const analysisId = createRecordingAnalysisId();
    await db.insert(recordingAnalyses).values({
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
        speakerGain: settings.speakerGain,
        micDeviceId: settings.inputDeviceId,
        speakerDeviceId: settings.outputDeviceId,
        stt: { providerId: sttConfig.providerId, modelId: sttConfig.modelId },
      },
      'recording started',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start recording';
    return err(message, 400);
  }

  const [row] = await db.select().from(recordings).where(eq(recordings.id, id));
  if (!row) {
    return err('Recording not found', 404);
  }

  internalBus.emit('recording.started', { recordingId: id });

  return ok({
    recording: toRecording(row),
    recordingId: id,
    micDeviceId: settings.inputDeviceId,
    speakerDeviceId: settings.outputDeviceId,
    speakerGain: settings.speakerGain,
    audioChunkConfig: { encoding: sttConfig.encoding, sampleRateHz: sttConfig.sampleRateHz },
    stt: { providerId: sttConfig.providerId, modelId: sttConfig.modelId },
  });
}

export async function stopRecording(
  input: StopRecordingInput,
): Promise<ServiceResult<StopRecordingResponse>> {
  const current = activeRecording;
  if (!current) {
    return err('No active recording', 400);
  }

  const db = getDb();
  activeRecording = null;

  try {
    const endedAt = Date.now();
    const durationMs = input.durationMs;

    await db
      .update(recordings)
      .set({
        status: 'completed',
        endedAt,
        durationMs,
        updatedAt: Date.now(),
      })
      .where(and(eq(recordings.id, current.id), eq(recordings.status, 'recording')));

    await db
      .update(recordingAnalyses)
      .set({
        endedAt: Date.now(),
        durationMs: durationMs ?? undefined,
        updatedAt: Date.now(),
      })
      .where(eq(recordingAnalyses.recordingId, current.id));

    // Final flush of in-memory transcript to the recordings directory
    await finalFlushAndCleanup(current.id);

    log.info(
      {
        recordingId: current.id,
      },
      'recording stopped',
    );

    const {
      'recordings.autoAnalyze': autoAnalyze,
      'recordings.analysis.defaultTemplateId': defaultTemplateId,
    } = await getSettings([
      'recordings.autoAnalyze',
      'recordings.analysis.defaultTemplateId',
    ] as const);

    if (autoAnalyze) {
      void startRecordingAnalysis(current.id, {
        templateId: defaultTemplateId as PrefixedString<'mnt'>,
      }).then((result) => {
        if ('error' in result) {
          log.warn({ recordingId: current.id, error: result.error }, 'auto analysis skipped');
        }
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to stop recording';
    await db
      .update(recordings)
      .set({
        status: 'failed',
        error: message,
        endedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(recordings.id, current.id));

    return err(message, 400);
  }

  const [row] = await db.select().from(recordings).where(eq(recordings.id, current.id));
  if (!row) {
    return err('Recording not found', 404);
  }

  internalBus.emit('recording.stopped', { recordingId: current.id });

  return ok({ recording: toRecording(row) });
}

export async function deleteRecording(recordingId: Recording['id']): Promise<ServiceResult<null>> {
  if (activeRecording?.id === recordingId) {
    return err('Cannot delete an active recording', 400);
  }

  const db = getDb();
  const [row] = await db.select().from(recordings).where(eq(recordings.id, recordingId));

  if (!row) {
    return err('Recording not found', 404);
  }

  await db.delete(recordings).where(eq(recordings.id, recordingId));
  await deleteRecordingFiles(recordingId);

  return ok(null);
}
