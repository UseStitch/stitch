import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { StartRecordingInput } from '@stitch/shared/recordings/types';

import { isServiceError } from '@/lib/service-result.js';
import { listRecordings, startRecording, stopRecording } from '@/recordings/service.js';

const startRecordingSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
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
