import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { StartRecordingInput, StopRecordingInput } from '@stitch/shared/recordings/types';

import { unwrapResult } from '@/lib/route-helpers.js';
import { paginationQuerySchema } from '@/lib/route-schemas.js';
import { cancelRecordingAnalysis, startRecordingAnalysis } from '@/recordings/analysis-service.js';
import {
  createMeetingNoteTemplate,
  deleteMeetingNoteTemplate,
  listMeetingNoteTemplates,
  updateMeetingNoteTemplate,
} from '@/recordings/meeting-note-templates.js';
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
  sttProviderId: z.string().min(1).optional(),
  sttModelId: z.string().min(1).optional(),
});

const stopRecordingSchema = z.object({
  durationMs: z.number().int().nonnegative().nullable(),
});

const recordingIdParamSchema = z.object({
  id: z.templateLiteral([z.literal('rec'), z.string()]),
});

const meetingNoteTemplateIdParamSchema = z.object({
  id: z.templateLiteral([z.literal('mnt'), z.string()]),
});

const meetingNoteTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  content: z.string().max(50_000),
});

const analyzeQuerySchema = z.object({
  force: z.enum(['1', 'true']).optional(),
});

const analyzeBodySchema = z.object({
  templateId: z.templateLiteral([z.literal('mnt'), z.string()]),
});

export const recordingsRouter = new Hono();

recordingsRouter.get(
  '/',
  zValidator('query', paginationQuerySchema({ pageSize: 10 })),
  async (c) => {
    const { page, pageSize } = c.req.valid('query');
    const result = await listRecordings({ page, pageSize });
    return unwrapResult(c, result);
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

recordingsRouter.get('/templates', async (c) => {
  const result = await listMeetingNoteTemplates();
  return unwrapResult(c, result);
});

recordingsRouter.post('/templates', zValidator('json', meetingNoteTemplateSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createMeetingNoteTemplate(body);
  return unwrapResult(c, result, 201);
});

recordingsRouter.put(
  '/templates/:id',
  zValidator('param', meetingNoteTemplateIdParamSchema),
  zValidator('json', meetingNoteTemplateSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await updateMeetingNoteTemplate(id, body);
    return unwrapResult(c, result);
  },
);

recordingsRouter.delete(
  '/templates/:id',
  zValidator('param', meetingNoteTemplateIdParamSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const result = await deleteMeetingNoteTemplate(id);
    return unwrapResult(c, result, 204);
  },
);

recordingsRouter.delete('/:id', zValidator('param', recordingIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await deleteRecording(id);
  return unwrapResult(c, result, 204);
});

recordingsRouter.get('/active', (c) => unwrapResult(c, getActiveRecording()));

recordingsRouter.get('/:id', zValidator('param', recordingIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const result = await getRecordingDetails(id);
  return unwrapResult(c, result);
});

recordingsRouter.post(
  '/:id/analyze',
  zValidator('param', recordingIdParamSchema),
  zValidator('query', analyzeQuerySchema),
  zValidator('json', analyzeBodySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { force } = c.req.valid('query');
    const { templateId } = c.req.valid('json');
    const result = await startRecordingAnalysis(id, { force: !!force, templateId });
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
