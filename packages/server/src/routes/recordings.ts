import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { StartRecordingInput } from '@stitch/shared/recordings/types';

import { isServiceError } from '@/lib/service-result.js';
import {
  getRecordingAudioFile,
  listRecordings,
  startRecording,
  stopRecording,
} from '@/recordings/service.js';

const startRecordingSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  platform: z
    .enum(['manual', 'zoom', 'teams', 'slack', 'discord', 'google-meet'])
    .optional(),
});

export const recordingsRouter = new Hono();

recordingsRouter.get('/', async (c) => {
  const result = await listRecordings();
  return c.json(result);
});

recordingsRouter.post('/start', zValidator('json', startRecordingSchema), async (c) => {
  const body = c.req.valid('json') as StartRecordingInput;
  const result = await startRecording(body);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data, 201);
});

recordingsRouter.post('/stop', async (c) => {
  const result = await stopRecording();
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.data);
});

recordingsRouter.get('/:id/audio', async (c) => {
  const id = c.req.param('id') as `rec_${string}`;
  const result = await getRecordingAudioFile(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  const stat = await fs.stat(result.data.filePath);
  const range = c.req.header('range');

  if (range?.startsWith('bytes=')) {
    const [startToken, endToken] = range.slice('bytes='.length).split('-');
    const start = startToken ? Number.parseInt(startToken, 10) : 0;
    const end = endToken ? Number.parseInt(endToken, 10) : stat.size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start || start >= stat.size) {
      return new Response(null, {
        status: 416,
        headers: {
          'content-range': `bytes */${stat.size}`,
        },
      });
    }

    const boundedEnd = Math.min(end, stat.size - 1);
    const chunkSize = boundedEnd - start + 1;
    const stream = createReadStream(result.data.filePath, { start, end: boundedEnd });

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'content-disposition': `inline; filename="${id}.wav"`,
        'content-length': String(chunkSize),
        'content-range': `bytes ${start}-${boundedEnd}/${stat.size}`,
        'content-type': result.data.mimeType,
      },
    });
  }

  const stream = createReadStream(result.data.filePath);

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
      'content-disposition': `inline; filename="${id}.wav"`,
      'content-length': String(stat.size),
      'content-type': result.data.mimeType,
    },
  });
});
