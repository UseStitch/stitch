import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { StartRecordingInput } from '@stitch/shared/recordings/types';

import { isServiceError } from '@/lib/service-result.js';
import {
  deleteRecording,
  getRecordingAudioFile,
  listRecordings,
  startRecording,
  stopRecording,
} from '@/recordings/service.js';
import {
  cancelRecordingAnalysis,
  getRecordingAnalysis,
  startRecordingAnalysis,
} from '@/recordings/analysis-service.js';

const startRecordingSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  platform: z
    .enum(['manual', 'zoom', 'teams', 'slack', 'discord', 'google-meet'])
    .optional(),
});

export const recordingsRouter = new Hono();

function parsePagination(query: Record<string, string | undefined>) {
  const pageRaw = Number.parseInt(query.page ?? '1', 10);
  const pageSizeRaw = Number.parseInt(query.pageSize ?? '10', 10);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 100) : 10;

  return { page, pageSize };
}

recordingsRouter.get('/', async (c) => {
  const { page, pageSize } = parsePagination({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  });
  const result = await listRecordings({ page, pageSize });
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

recordingsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id') as `rec_${string}`;
  const result = await deleteRecording(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
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
        'content-disposition': `inline; filename="${id}.ogg"`,
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
      'content-disposition': `inline; filename="${id}.ogg"`,
      'content-length': String(stat.size),
      'content-type': result.data.mimeType,
    },
  });
});

recordingsRouter.post('/:id/analyze', async (c) => {
  const id = c.req.param('id') as `rec_${string}`;
  const forceRaw = c.req.query('force');
  const force = forceRaw === '1' || forceRaw === 'true';
  const result = await startRecordingAnalysis(id, { force });
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data, 202);
});

recordingsRouter.get('/:id/analysis', async (c) => {
  const id = c.req.param('id') as `rec_${string}`;
  const result = await getRecordingAnalysis(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.data);
});

recordingsRouter.post('/:id/analysis/cancel', async (c) => {
  const id = c.req.param('id') as `rec_${string}`;
  const result = await cancelRecordingAnalysis(id);
  if (isServiceError(result)) {
    return c.json({ error: result.error }, result.status);
  }

  return c.body(null, 204);
});
