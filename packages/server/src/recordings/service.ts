import { and, desc, eq, sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createAudioCaptureHandle } from '@stitch/audio-capture';
import type { AudioDeviceList, AudioPermissionsStatus } from '@stitch/audio-capture';
import { createRecordingId } from '@stitch/shared/id';
import type {
  ListRecordingsResponse,
  Recording,
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
} from '@stitch/shared/recordings/types';

import { getDb } from '@/db/client.js';
import { recordingAnalyses, recordings, userSettings } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { computeTotalPages } from '@/lib/paginated-query.js';
import { PATHS } from '@/lib/paths.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { broadcast } from '@/lib/sse.js';
import { startRecordingAnalysis } from '@/recordings/analysis-service.js';

type RecordingRow = typeof recordings.$inferSelect;

type ActiveRecording = {
  id: Recording['id'];
  filePath: string;
};

const capture = createAudioCaptureHandle();
let activeRecording: ActiveRecording | null = null;
const log = Log.create({ service: 'recordings' });

type RecordingCaptureSettings = {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  speakerGain: number;
};

async function readCaptureSettings(): Promise<RecordingCaptureSettings> {
  const db = getDb();
  const rows = await db
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(
      sql`${userSettings.key} IN ('recordings.inputDeviceId', 'recordings.outputDeviceId', 'recordings.speakerGain')`,
    );

  const map = new Map(rows.map((r) => [r.key, r.value]));

  const inputDeviceId = map.get('recordings.inputDeviceId') || null;
  const outputDeviceId = map.get('recordings.outputDeviceId') || null;

  const rawGain = Number.parseFloat(map.get('recordings.speakerGain') ?? '10');
  const speakerGain = Number.isFinite(rawGain) ? Math.max(0.1, Math.min(50, rawGain)) : 10;

  return { inputDeviceId, outputDeviceId, speakerGain };
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

function toRecording(row: RecordingRow, analysisTitle: string | null = null): Recording {
  return {
    id: row.id,
    title: row.title,
    analysisTitle,
    source: row.source,
    status: row.status,
    platform: row.platform,
    mimeType: row.mimeType,
    filePath: row.filePath,
    fileSizeBytes: row.fileSizeBytes,
    durationMs: row.durationMs,
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
      .select({ recording: recordings, analysisTitle: recordingAnalyses.title })
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
    recordings: rows.map((row) => toRecording(row.recording, row.analysisTitle || null)),
    activeRecordingId: activeRecording?.id ?? null,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages,
  };
}

export async function startRecording(
  input: StartRecordingInput,
): Promise<ServiceResult<StartRecordingResponse>> {
  if (activeRecording !== null || capture.getActive() !== null) {
    return err('Recording already in progress', 400);
  }

  const db = getDb();
  const id = createRecordingId();
  const now = Date.now();
  const title = input.title?.trim() || defaultTitle();
  const outputDir = path.join(PATHS.dirPaths.recordings, id);
  const filePath = path.join(outputDir, 'raw_audio.ogg');

  await fs.mkdir(outputDir, { recursive: true });

  await db.insert(recordings).values({
    id,
    title,
    source: 'manual',
    status: 'recording',
    platform: input.platform ?? 'manual',
    mimeType: 'audio/ogg',
    filePath,
    startedAt: now,
  });

  try {
    const settings = await readCaptureSettings();
    await capture.start({
      outputPath: filePath,
      channels: 1,
      micDeviceId: settings.inputDeviceId,
      speakerDeviceId: settings.outputDeviceId,
      speakerGain: settings.speakerGain,
    });

    capture.onEvent((event) => {
      if (event.type === 'warning') {
        void broadcast('recording-warning', { code: event.code, message: event.message });
      } else if (event.type === 'deviceChanged') {
        void broadcast('recording-device-changed', {
          kind: event.kind,
          deviceName: event.deviceName,
        });
      }
    });

    activeRecording = { id, filePath };
    log.info(
      {
        recordingId: id,
        filePath,
        speakerGain: settings.speakerGain,
        micDeviceId: settings.inputDeviceId,
        speakerDeviceId: settings.outputDeviceId,
      },
      'recording started',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start recording';

    await db
      .update(recordings)
      .set({
        status: 'failed',
        error: message,
        endedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(recordings.id, id));

    return err(message, 400);
  }

  const [row] = await db.select().from(recordings).where(eq(recordings.id, id));
  if (!row) {
    return err('Recording not found', 404);
  }

  return ok({ recording: toRecording(row) });
}

export async function getRecordingAudioFile(
  recordingId: Recording['id'],
): Promise<ServiceResult<{ filePath: string; mimeType: string }>> {
  const db = getDb();
  const [row] = await db.select().from(recordings).where(eq(recordings.id, recordingId));

  if (!row) {
    return err('Recording not found', 404);
  }

  const stat = await fs.stat(row.filePath).catch(() => null);
  if (!stat?.isFile()) {
    return err('Recording file not found', 404);
  }

  return ok({ filePath: row.filePath, mimeType: row.mimeType });
}

export async function stopRecording(): Promise<ServiceResult<StopRecordingResponse>> {
  const current = activeRecording;
  if (!current) {
    return err('No active recording', 400);
  }

  const db = getDb();
  activeRecording = null;

  try {
    const stop = await capture.stop();
    const endedAt = stop?.endedAt ?? Date.now();
    const durationMs = stop?.durationMs ?? null;
    const stat = await fs.stat(current.filePath).catch(() => null);

    await db
      .update(recordings)
      .set({
        status: 'completed',
        endedAt,
        durationMs,
        fileSizeBytes: stat?.size ?? null,
        updatedAt: Date.now(),
      })
      .where(and(eq(recordings.id, current.id), eq(recordings.status, 'recording')));

    log.info(
      {
        recordingId: current.id,
        filePath: current.filePath,
        stopped: stop,
        fileSizeBytes: stat?.size ?? null,
      },
      'recording stopped',
    );

    const [autoAnalyzeSetting] = await db
      .select({ value: userSettings.value })
      .from(userSettings)
      .where(eq(userSettings.key, 'recordings.autoAnalyze'));

    if (autoAnalyzeSetting?.value === 'true') {
      void startRecordingAnalysis(current.id).then((result) => {
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

  const recordingDir = path.dirname(row.filePath);
  const relativeRecordingDir = path.relative(PATHS.dirPaths.recordings, recordingDir);
  if (relativeRecordingDir.startsWith('..') || path.isAbsolute(relativeRecordingDir)) {
    return err('Recording path is outside recordings directory', 400);
  }

  try {
    await fs.rm(recordingDir, { recursive: true, force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete recording files';
    return err(message, 400);
  }

  await db.delete(recordings).where(eq(recordings.id, recordingId));

  return ok(null);
}

export async function listAudioDevices(): Promise<ServiceResult<AudioDeviceList>> {
  try {
    const devices = await capture.listDevices();
    return ok(devices);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list audio devices';
    log.warn({ error: message }, 'failed to list audio devices');
    return err(message, 500);
  }
}

export async function checkAudioPermissions(): Promise<ServiceResult<AudioPermissionsStatus>> {
  try {
    const permissions = await capture.checkPermissions();
    return ok(permissions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check audio permissions';
    log.warn({ error: message }, 'failed to check audio permissions');
    return err(message, 500);
  }
}
