import { Hono } from 'hono';
import { z } from 'zod';

import type { RecordingIngestMessage } from '@stitch/shared/chat/realtime';

import * as Events from '@/lib/events.js';
import type { createNodeWebSocket } from '@hono/node-ws';

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>['upgradeWebSocket'];

const ingestMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    recordingId: z.string().min(1),
    audioChunkConfig: z.object({
      encoding: z.enum(['f32le', 'pcm_s16le']),
      sampleRateHz: z.number().int().positive(),
    }),
  }),
  z.object({
    type: z.literal('chunk'),
    recordingId: z.string().min(1),
    source: z.enum(['mic', 'speaker']),
    samplesB64: z.string(),
    sampleRateHz: z.number().int().positive(),
    numSamples: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('stop'),
    recordingId: z.string().min(1),
  }),
]);

function parseIngestMessage(data: unknown): RecordingIngestMessage | null {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    return ingestMessageSchema.parse(JSON.parse(data)) as RecordingIngestMessage;
  } catch {
    return null;
  }
}

export function createRecordingsIngestRouter(upgradeWebSocket: UpgradeWebSocket): Hono {
  const router = new Hono();

  router.get(
    '/ingest',
    upgradeWebSocket(() => {
      let recordingId: string | null = null;

      return {
        onMessage(event, ws) {
          const message = parseIngestMessage(event.data);
          if (!message) {
            ws.close(1003, 'Invalid recording ingest message');
            return;
          }

          if (message.type === 'start') {
            recordingId = message.recordingId;
            return;
          }

          if (message.type === 'stop') {
            recordingId = null;
            return;
          }

          // Chunks are only accepted once the connection has been bound to a
          // recording via `start`, and only for that recording.
          if (recordingId === null || message.recordingId !== recordingId) {
            ws.close(1008, 'Recording ingest chunk does not match an active recording');
            return;
          }

          Events.emit('recording-audio-chunk', {
            recordingId: message.recordingId,
            source: message.source,
            samplesB64: message.samplesB64,
            sampleRateHz: message.sampleRateHz,
            numSamples: message.numSamples,
          });
        },
      };
    }),
  );

  return router;
}
