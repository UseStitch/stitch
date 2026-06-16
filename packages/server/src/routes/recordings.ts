import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { StartRecordingInput, StopRecordingInput } from '@stitch/shared/recordings/types';

import { unwrapResult } from '@/lib/route-helpers.js';
import { paginationQuerySchema } from '@/lib/route-schemas.js';
import { cancelRecordingAnalysis, startRecordingAnalysis } from '@/recordings/analysis-service.js';
import {
  deleteRecording,
  getActiveRecording,
  getRecordingDetails,
  listRecordings,
  startRecording,
  stopRecording,
} from '@/recordings/service.js';

const startRecordingSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  platform: z.enum(['manual', 'zoom', 'teams', 'slack', 'discord', 'google-meet']).optional(),
});

const stopRecordingSchema = z.object({
  durationMs: z.number().int().nonnegative().nullable(),
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

recordingsRouter.post('/stop', zValidator('json', stopRecordingSchema), async (c) => {
  const body = c.req.valid('json') as StopRecordingInput;
  const result = await stopRecording(body);
  return unwrapResult(c, result);
});

recordingsRouter.delete('/:id', zValidator('param', recordingIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await deleteRecording(id);
  return unwrapResult(c, result, 204);
});

recordingsRouter.get('/active', (c) => c.json(getActiveRecording()));

recordingsRouter.get('/:id', zValidator('param', recordingIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await getRecordingDetails(id);
  return unwrapResult(c, result);
});

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

recordingsRouter.post(
  '/:id/analysis/cancel',
  zValidator('param', recordingIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await cancelRecordingAnalysis(id);
    return unwrapResult(c, result, 204);
  },
);
