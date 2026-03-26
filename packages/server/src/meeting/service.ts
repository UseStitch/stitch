import { existsSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import { desc, eq, inArray } from 'drizzle-orm';

import { createRecordingId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { MeetingInfo, MeetingService, RecordingResult } from '@stitch/recordings';
import { createMeetingService, RecordingWriter } from '@stitch/recordings';

import { getDb } from '@/db/client.js';
import { meetings, providerConfig, userSettings } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { broadcast } from '@/lib/sse.js';
import { startTranscription } from '@/meeting/transcription-service.js';

const log = Log.create({ service: 'meeting-service' });
const detectionLog = Log.create({ service: 'meeting-detection' });

const MONITORED_APPS = ['slack', 'discord', 'zoom', 'teams', 'chrome'];
const GRACE_PERIOD_MS = 10_000;
const ON_DEMAND_APP_NAME = 'Manual recording';
const ON_DEMAND_APP_PATH = 'manual://stitch';

let meetingService: MeetingService | null = null;
const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function initMeetingService(): Promise<void> {
  const recordingsDir = PATHS.dirPaths.recordings;
  if (!existsSync(recordingsDir)) {
    mkdirSync(recordingsDir, { recursive: true });
  }

  const writer = new RecordingWriter(recordingsDir);

  meetingService = createMeetingService({
    apps: MONITORED_APPS,
    writer,
    pollIntervalMs: 1000,
    logger: detectionLog,
  });

  meetingService.on('meeting:start', onMeetingStart);
  meetingService.on('meeting:stop', onMeetingStop);
  meetingService.on('recording:write', onRecordingWrite);
  meetingService.on('error', onError);

  await meetingService.start();
  log.info({ apps: MONITORED_APPS }, 'meeting service started');
}

async function onMeetingStart(meeting: MeetingInfo): Promise<void> {
  const db = getDb();
  const meetingId = meeting.id as PrefixedString<'rec'>;
  const now = Date.now();

  log.info({ meetingId, app: meeting.app }, 'meeting detected');

  await db.insert(meetings).values({
    id: meetingId,
    app: meeting.app,
    appPath: meeting.appPath,
    status: 'detected',
    startedAt: meeting.startedAt.getTime(),
    createdAt: now,
    updatedAt: now,
  });

  await broadcast('meeting-detected', {
    meetingId,
    app: meeting.app,
    startedAt: meeting.startedAt.getTime(),
  });
}

async function onMeetingStop(meeting: MeetingInfo): Promise<void> {
  const db = getDb();
  const meetingId = meeting.id as PrefixedString<'rec'>;

  log.info({ meetingId, app: meeting.app }, 'meeting ended');

  const [row] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!row) return;

  // If the meeting was actively recording, the recording:write event handles completion.
  // If it was only detected (user hadn't responded yet), start the grace period.
  if (row.status === 'detected') {
    const timer = setTimeout(async () => {
      graceTimers.delete(meetingId);
      await autoDismiss(meetingId);
    }, GRACE_PERIOD_MS);

    graceTimers.set(meetingId, timer);
  }
}

async function onRecordingWrite(meeting: MeetingInfo, result: RecordingResult): Promise<void> {
  const db = getDb();
  const meetingId = meeting.id as PrefixedString<'rec'>;
  const now = Date.now();

  log.info({ meetingId, durationSecs: result.file.durationSecs }, 'recording finished');

  await db
    .update(meetings)
    .set({
      status: 'completed',
      recordingFilePath: result.file.path,
      durationSecs: result.file.durationSecs,
      endedAt: now,
      updatedAt: now,
    })
    .where(eq(meetings.id, meetingId));

  await broadcast('meeting-recording-finished', {
    meetingId,
    app: meeting.app,
    durationSecs: result.file.durationSecs,
  });

  void maybeAutoTranscribeRecording(meetingId);
}

async function maybeAutoTranscribeRecording(meetingId: PrefixedString<'rec'>): Promise<void> {
  const db = getDb();
  const settingsRows = await db
    .select()
    .from(userSettings)
    .where(
      inArray(userSettings.key, [
        'recordings.autoTranscribe',
        'recordings.default.providerId',
        'recordings.default.modelId',
      ]),
    );

  const autoTranscribe = settingsRows.find((row) => row.key === 'recordings.autoTranscribe')?.value;
  if (autoTranscribe !== 'true') {
    return;
  }

  const providerId = settingsRows.find((row) => row.key === 'recordings.default.providerId')?.value;
  const modelId = settingsRows.find((row) => row.key === 'recordings.default.modelId')?.value;

  if (!providerId || !modelId) {
    log.warn({ meetingId }, 'auto-transcribe is enabled but recording model is not configured');
    return;
  }

  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));

  if (!config) {
    log.warn(
      { meetingId, providerId, modelId },
      'auto-transcribe skipped because provider is not configured',
    );
    return;
  }

  try {
    const transcriptionId = await startTranscription({
      meetingId,
      providerId,
      modelId,
      credentials: config.credentials,
    });
    log.info({ meetingId, transcriptionId, providerId, modelId }, 'auto-transcription started');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(
      { meetingId, providerId, modelId, error: errorMessage },
      'failed to auto-start transcription',
    );
  }
}

function onError(err: Error): void {
  log.error({ err }, 'meeting service error');
}

async function autoDismiss(meetingId: PrefixedString<'rec'>): Promise<void> {
  const db = getDb();

  const [row] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!row || row.status !== 'detected') return;

  log.info({ meetingId }, 'auto-dismissing meeting after grace period');

  await db.delete(meetings).where(eq(meetings.id, meetingId));

  await broadcast('meeting-ended', { meetingId });
}

export async function acceptMeeting(meetingId: PrefixedString<'rec'>): Promise<void> {
  if (!meetingService) {
    throw new Error('Meeting service not initialized');
  }

  const db = getDb();
  const now = Date.now();

  // Clear any grace timer
  const timer = graceTimers.get(meetingId);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(meetingId);
  }

  const [row] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!row) {
    throw new Error(`Meeting not found: ${meetingId}`);
  }
  if (row.status !== 'detected') {
    throw new Error(`Meeting is not in detected state: ${meetingId} (status: ${row.status})`);
  }

  await meetingService.startRecording(meetingId);

  await db
    .update(meetings)
    .set({ status: 'recording', startedAt: now, updatedAt: now })
    .where(eq(meetings.id, meetingId));

  await broadcast('meeting-recording-started', {
    meetingId,
    app: row.app,
    startedAt: now,
  });

  log.info({ meetingId }, 'meeting recording accepted');
}

export async function startMeetingRecordingOnDemand(): Promise<{
  meetingId: PrefixedString<'rec'>;
  app: string;
  startedAt: number;
}> {
  if (!meetingService) {
    throw new Error('Meeting service not initialized');
  }

  const db = getDb();
  const [activeRecording] = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.status, 'recording'));
  if (activeRecording) {
    throw new Error(`A recording is already in progress: ${activeRecording.id}`);
  }

  const meetingId = createRecordingId();
  const meeting = await meetingService.startRecordingOnDemand(meetingId, {
    app: ON_DEMAND_APP_NAME,
    appPath: ON_DEMAND_APP_PATH,
  });

  const startedAt = meeting.startedAt.getTime();
  const now = Date.now();

  await db.insert(meetings).values({
    id: meetingId,
    app: meeting.app,
    appPath: meeting.appPath,
    status: 'recording',
    startedAt,
    createdAt: now,
    updatedAt: now,
  });

  await broadcast('meeting-recording-started', {
    meetingId,
    app: meeting.app,
    startedAt,
  });

  log.info({ meetingId }, 'on-demand recording started');

  return {
    meetingId,
    app: meeting.app,
    startedAt,
  };
}

export async function dismissMeeting(meetingId: PrefixedString<'rec'>): Promise<void> {
  const db = getDb();

  // Clear any grace timer
  const timer = graceTimers.get(meetingId);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(meetingId);
  }

  const [row] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!row) {
    throw new Error(`Meeting not found: ${meetingId}`);
  }
  if (row.status !== 'detected') {
    throw new Error(`Meeting is not in detected state: ${meetingId} (status: ${row.status})`);
  }

  await db.delete(meetings).where(eq(meetings.id, meetingId));

  await broadcast('meeting-ended', { meetingId });

  log.info({ meetingId }, 'meeting dismissed');
}

export async function getActiveMeetings(): Promise<(typeof meetings.$inferSelect)[]> {
  const db = getDb();
  return db
    .select()
    .from(meetings)
    .where(
      eq(meetings.status, 'detected'),
    )
    .union(
      db.select().from(meetings).where(eq(meetings.status, 'recording')),
    );
}

export async function getAllMeetings(): Promise<(typeof meetings.$inferSelect)[]> {
  const db = getDb();
  return db.select().from(meetings).orderBy(desc(meetings.createdAt));
}

export async function getMeetingById(
  meetingId: PrefixedString<'rec'>,
): Promise<typeof meetings.$inferSelect | undefined> {
  const db = getDb();
  const [row] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  return row;
}

export async function deleteMeeting(meetingId: PrefixedString<'rec'>): Promise<void> {
  const db = getDb();

  const [row] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!row) {
    throw new Error(`Meeting not found: ${meetingId}`);
  }

  const timer = graceTimers.get(meetingId);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(meetingId);
  }

  // Must cancel before deleting files since the service holds handles to them
  if (meetingService) {
    await meetingService.cancelMeeting(meetingId);
  }

  if (row.recordingFilePath) {
    const recordingDir = path.dirname(row.recordingFilePath);
    if (existsSync(recordingDir)) {
      await rm(recordingDir, { recursive: true, force: true });
    }
  }

  // Cascades to recording_transcriptions
  await db.delete(meetings).where(eq(meetings.id, meetingId));

  await broadcast('meeting-ended', { meetingId });

  log.info({ meetingId }, 'meeting deleted');
}

export async function stopMeetingRecording(meetingId: PrefixedString<'rec'>): Promise<void> {
  if (!meetingService) {
    throw new Error('Meeting service not initialized');
  }

  const db = getDb();

  const [row] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!row) {
    throw new Error(`Meeting not found: ${meetingId}`);
  }
  if (row.status !== 'recording') {
    throw new Error(`Meeting is not recording: ${meetingId} (status: ${row.status})`);
  }

  await meetingService.stopRecording(meetingId);

  log.info({ meetingId }, 'meeting recording manually stopped');
}
