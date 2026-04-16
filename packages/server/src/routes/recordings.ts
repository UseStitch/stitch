import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { z } from 'zod';

import type { StartRecordingInput } from '@stitch/shared/recordings/types';

import {
  cancelRecordingAnalysis,
  getRecordingAnalysis,
  startRecordingAnalysis,
} from '@/recordings/analysis-service.js';
import {
  checkAudioPermissions,
  deleteRecording,
  getRecordingAudioFile,
  listAudioDevices,
  listRecordings,
  startRecording,
  stopRecording,
} from '@/recordings/service.js';
import { unwrapResult } from '@/lib/route-helpers.js';
import { isServiceError } from '@/lib/service-result.js';
import { paginationQuerySchema } from '@/lib/route-schemas.js';

const startRecordingSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  platform: z.enum(['manual', 'zoom', 'teams', 'slack', 'discord', 'google-meet']).optional(),
});

const recordingIdParamSchema = z.object({
  id: z.templateLiteral([z.literal('rec'), z.string()]),
});

const analyzeQuerySchema = z.object({
  force: z.enum(['1', 'true']).optional(),
});

export const recordingsRouter = new Hono();

recordingsRouter.get(
  '/',
  zValidator('query', paginationQuerySchema({ pageSize: 10 })),
  async (c) => {
    const { page, pageSize } = c.req.valid('query');
    const result = await listRecordings({ page, pageSize });
    return c.json(result);
  },
);

recordingsRouter.post('/start', zValidator('json', startRecordingSchema), async (c) => {
  const body = c.req.valid('json') as StartRecordingInput;
  const result = await startRecording(body);
  return unwrapResult(c, result, 201);
});

recordingsRouter.post('/stop', async (c) => {
  const result = await stopRecording();
  return unwrapResult(c, result);
});

recordingsRouter.get('/devices', async (c) => {
  const result = await listAudioDevices();
  return unwrapResult(c, result);
});

recordingsRouter.get('/permissions', async (c) => {
  const result = await checkAudioPermissions();
  return unwrapResult(c, result);
});

recordingsRouter.delete('/:id', zValidator('param', recordingIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await deleteRecording(id);
  return unwrapResult(c, result, 204);
});

recordingsRouter.get(
  '/:id/audio',
  zValidator('param', recordingIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await getRecordingAudioFile(id);
    if (isServiceError(result)) return unwrapResult(c, result);

    const stat = await fs.stat(result.data.filePath);
    const range = c.req.header('range');

    if (range?.startsWith('bytes=')) {
      const [startToken, endToken] = range.slice('bytes='.length).split('-');
      const start = startToken ? Number.parseInt(startToken, 10) : 0;
      const end = endToken ? Number.parseInt(endToken, 10) : stat.size - 1;

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end < start ||
        start >= stat.size
      ) {
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
  },
);

recordingsRouter.post(
  '/:id/analyze',
  zValidator('param', recordingIdParamSchema),
  zValidator('query', analyzeQuerySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { force } = c.req.valid('query');
    const result = await startRecordingAnalysis(id, { force: !!force });
    return unwrapResult(c, result, 202);
  },
);

recordingsRouter.get(
  '/:id/analysis',
  zValidator('param', recordingIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await getRecordingAnalysis(id);
    return unwrapResult(c, result);
  },
);

recordingsRouter.post(
  '/:id/analysis/cancel',
  zValidator('param', recordingIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await cancelRecordingAnalysis(id);
    return unwrapResult(c, result, 204);
  },
);
