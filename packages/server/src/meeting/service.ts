import { existsSync, mkdirSync } from 'node:fs';

import { desc, eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import type { MeetingInfo, MeetingService, RecordingResult } from '@stitch/recordings';
import { createMeetingService, RecordingWriter } from '@stitch/recordings';

import { getDb } from '@/db/client.js';
import { meetings } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { broadcast } from '@/lib/sse.js';

const log = Log.create({ service: 'meeting-service' });
const detectionLog = Log.create({ service: 'meeting-detection' });

const MONITORED_APPS = ['slack', 'discord', 'zoom', 'teams'];
const GRACE_PERIOD_MS = 10_000;

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
    .set({ status: 'recording', updatedAt: now })
    .where(eq(meetings.id, meetingId));

  log.info({ meetingId }, 'meeting recording accepted');
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
