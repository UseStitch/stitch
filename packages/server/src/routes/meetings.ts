import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema.js';
import {
  acceptMeeting,
  deleteMeeting,
  dismissMeeting,
  getActiveMeetings,
  getAllMeetings,
  getMeetingById,
  startMeetingRecordingOnDemand,
  stopMeetingRecording,
} from '@/meeting/service.js';
import {
  getLatestTranscription,
  getTranscriptions,
  startTranscription,
} from '@/meeting/transcription-service.js';

export const meetingsRouter = new Hono();

meetingsRouter.get('/', async (c) => {
  const rows = await getAllMeetings();
  return c.json(rows);
});

meetingsRouter.get('/active', async (c) => {
  const rows = await getActiveMeetings();
  return c.json(rows);
});

meetingsRouter.post('/start', async (c) => {
  try {
    const meeting = await startMeetingRecordingOnDemand();
    return c.json(meeting);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 400);
  }
});

meetingsRouter.get('/:meetingId/audio', async (c) => {
  const meetingId = c.req.param('meetingId') as PrefixedString<'rec'>;

  const meeting = await getMeetingById(meetingId);
  if (!meeting) {
    return c.json({ error: 'Meeting not found' }, 404);
  }

  const filePath = meeting.recordingFilePath;
  if (!filePath || !existsSync(filePath)) {
    return c.json({ error: 'No recording available' }, 404);
  }

  const stat = statSync(filePath);
  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

meetingsRouter.post('/:meetingId/accept', async (c) => {
  const meetingId = c.req.param('meetingId') as PrefixedString<'rec'>;

  try {
    await acceptMeeting(meetingId);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 400);
  }
});

meetingsRouter.post('/:meetingId/stop', async (c) => {
  const meetingId = c.req.param('meetingId') as PrefixedString<'rec'>;

  try {
    await stopMeetingRecording(meetingId);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 400);
  }
});

meetingsRouter.post('/:meetingId/dismiss', async (c) => {
  const meetingId = c.req.param('meetingId') as PrefixedString<'rec'>;

  try {
    await dismissMeeting(meetingId);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 400);
  }
});

meetingsRouter.delete('/:meetingId', async (c) => {
  const meetingId = c.req.param('meetingId') as PrefixedString<'rec'>;

  try {
    await deleteMeeting(meetingId);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 400);
  }
});

meetingsRouter.post('/:meetingId/transcribe', async (c) => {
  const meetingId = c.req.param('meetingId') as PrefixedString<'rec'>;
  const body = await c.req.json();

  if (!body.providerId || !body.modelId) {
    return c.json({ error: 'providerId and modelId are required' }, 400);
  }

  const meeting = await getMeetingById(meetingId);
  if (!meeting) {
    return c.json({ error: 'Meeting not found' }, 404);
  }
  if (!meeting.recordingFilePath || !existsSync(meeting.recordingFilePath)) {
    return c.json({ error: 'No recording available for this meeting' }, 400);
  }

  const db = getDb();
  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, body.providerId));

  if (!config) {
    return c.json({ error: `Provider "${body.providerId}" is not configured` }, 400);
  }

  const transcriptionId = await startTranscription({
    meetingId,
    providerId: body.providerId,
    modelId: body.modelId,
    credentials: config.credentials,
  });

  return c.json({ transcriptionId });
});

meetingsRouter.get('/:meetingId/transcription', async (c) => {
  const meetingId = c.req.param('meetingId') as PrefixedString<'rec'>;

  const transcription = await getLatestTranscription(meetingId);
  if (!transcription) {
    return c.json({ error: 'No transcription found' }, 404);
  }

  return c.json(transcription);
});

meetingsRouter.get('/:meetingId/transcriptions', async (c) => {
  const meetingId = c.req.param('meetingId') as PrefixedString<'rec'>;
  const transcriptions = await getTranscriptions(meetingId);
  return c.json(transcriptions);
});
