import fs from 'node:fs/promises';
import path from 'node:path';

import { and, desc, eq, sql } from 'drizzle-orm';

import { createAudioCaptureHandle } from '@stitch/audio-capture';
import { createRecordingId } from '@stitch/shared/id';
import type {
  ListRecordingsResponse,
  Recording,
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
} from '@stitch/shared/recordings/types';

import { getDb } from '@/db/client.js';
import { recordings } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

type RecordingRow = typeof recordings.$inferSelect;

type ActiveRecording = {
  id: Recording['id'];
  filePath: string;
};

const capture = createAudioCaptureHandle();
let activeRecording: ActiveRecording | null = null;
const log = Log.create({ service: 'recordings' });

function defaultTitle(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 19).replace('T', ' ');
  return `Meeting recording ${date}`;
}

function toRecording(row: RecordingRow): Recording {
  return {
    id: row.id,
    title: row.title,
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
      .select()
      .from(recordings)
      .orderBy(desc(recordings.createdAt))
      .limit(input.pageSize)
      .offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(recordings),
  ]);
  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

  return {
    recordings: rows.map(toRecording),
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
  const filePath = path.join(outputDir, 'raw_audio.wav');

  await fs.mkdir(outputDir, { recursive: true });

  await db.insert(recordings).values({
    id,
    title,
    source: 'manual',
    status: 'recording',
    platform: input.platform ?? 'manual',
    mimeType: 'audio/wav',
    filePath,
    startedAt: now,
  });

  try {
    await capture.start({
      outputPath: filePath,
      mode: 'dual',
      sampleRateHz: 48_000,
      channels: 1,
      enableAec: false,
    });
    activeRecording = { id, filePath };
    log.info({ recordingId: id, filePath, mode: 'dual', sampleRateHz: 48_000, enableAec: false }, 'recording started');
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
