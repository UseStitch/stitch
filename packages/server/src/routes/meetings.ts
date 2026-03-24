import { createReadStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';

import { Hono } from 'hono';

import type { PrefixedString } from '@stitch/shared/id';

import {
  acceptMeeting,
  dismissMeeting,
  getActiveMeetings,
  getAllMeetings,
  getMeetingById,
} from '@/meeting/service.js';

export const meetingsRouter = new Hono();

meetingsRouter.get('/', async (c) => {
  const rows = await getAllMeetings();
  return c.json(rows);
});

meetingsRouter.get('/active', async (c) => {
  const rows = await getActiveMeetings();
  return c.json(rows);
});

meetingsRouter.get('/:meetingId/audio/:track', async (c) => {
  const meetingId = c.req.param('meetingId') as PrefixedString<'rec'>;
  const track = c.req.param('track');

  if (track !== 'mic' && track !== 'speaker') {
    return c.json({ error: 'Invalid track. Must be "mic" or "speaker".' }, 400);
  }

  const meeting = await getMeetingById(meetingId);
  if (!meeting) {
    return c.json({ error: 'Meeting not found' }, 404);
  }

  const filePath = track === 'mic' ? meeting.micFilePath : meeting.speakerFilePath;
  if (!filePath || !existsSync(filePath)) {
    return c.json({ error: `No ${track} recording available` }, 404);
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
