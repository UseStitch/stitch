import { Hono } from 'hono';
import { z } from 'zod';

import type { SttInboundMessage, SttOutboundMessage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import { resolveSttAuth } from '@/stt/auth.js';
import { MODEL_CATALOG } from '@/stt/registry.js';
import { createDefaultResampler } from '@/stt/resampler.js';
import { createSTTSession, STTSessionError, type STTSession } from '@/stt/session.js';
import type { createNodeWebSocket } from '@hono/node-ws';

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>['upgradeWebSocket'];

const log = Log.create({ service: 'stt.route' });

const startMessageSchema = z.object({
  type: z.literal('start'),
  sttSessionId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  capabilityRequest: z
    .record(z.string(), z.enum(['required', 'preferred']))
    .optional()
    .default({}),
  language: z.string().optional(),
  keyterms: z.array(z.string()).optional(),
  audioChunkConfig: z.object({
    encoding: z.enum(['f32le', 'pcm_s16le']),
    sampleRateHz: z.number().int().positive(),
  }),
});

const chunkMessageSchema = z.object({
  type: z.literal('chunk'),
  sttSessionId: z.string().min(1),
  source: z.enum(['mic', 'speaker']),
  samplesB64: z.string(),
  sampleRateHz: z.number().int().positive(),
  numSamples: z.number().int().nonnegative(),
});

const commitMessageSchema = z.object({
  type: z.literal('commit'),
  sttSessionId: z.string().min(1),
});

const stopMessageSchema = z.object({
  type: z.literal('stop'),
  sttSessionId: z.string().min(1),
});

const inboundMessageSchema = z.discriminatedUnion('type', [
  startMessageSchema,
  chunkMessageSchema,
  commitMessageSchema,
  stopMessageSchema,
]);

function parseMessage(data: unknown): SttInboundMessage | null {
  if (typeof data !== 'string') return null;
  try {
    return inboundMessageSchema.parse(JSON.parse(data)) as SttInboundMessage;
  } catch {
    return null;
  }
}

const resampler = createDefaultResampler();

export function createSttRouter(upgradeWebSocket: UpgradeWebSocket): Hono {
  const router = new Hono();

  // Returns the STT model catalog filtered to providers with credentials configured.
  router.get('/providers/models', async (c) => {
    const entries = await Promise.all(
      MODEL_CATALOG.map(async (entry) => {
        const auth = await resolveSttAuth(entry.providerId);
        if (!auth) return null;
        return {
          providerId: entry.providerId,
          models: entry.models.map((m) => ({
            modelId: m.modelId,
            displayName: m.displayName,
            sampleRateHz: m.inputFormat.sampleRateHz,
          })),
        };
      }),
    );
    return c.json(entries.filter(Boolean));
  });

  router.get(
    '/stream',
    upgradeWebSocket(() => {
      let session: STTSession | null = null;
      let inputEncoding: 'f32le' | 'pcm_s16le' = 'pcm_s16le';

      function send(ws: { send(data: string | ArrayBuffer): void }, msg: SttOutboundMessage): void {
        ws.send(JSON.stringify(msg));
      }

      return {
        onOpen() {
          log.info('client WebSocket connected');
        },

        onMessage(event, ws) {
          const message = parseMessage(event.data);
          if (!message) {
            send(ws, {
              type: 'error',
              sttSessionId: '',
              message: 'Invalid message format',
              code: 'invalid_message',
            });
            return;
          }

          switch (message.type) {
            case 'start': {
              if (session) {
                send(ws, {
                  type: 'error',
                  sttSessionId: message.sttSessionId,
                  message: 'Session already active',
                  code: 'session_active',
                });
                return;
              }

              inputEncoding = message.audioChunkConfig.encoding;

              createSTTSession(
                {
                  sttSessionId: message.sttSessionId,
                  providerId: message.providerId,
                  modelId: message.modelId,
                  service: 'chat-input',
                  capabilityRequest: message.capabilityRequest,
                  language: message.language,
                  keyterms: message.keyterms,
                  inputEncoding,
                  inputSampleRateHz: message.audioChunkConfig.sampleRateHz,
                },
                { resampler },
              )
                .then((s) => {
                  session = s;

                  session.onTranscript((evt) => {
                    send(ws, {
                      type: 'transcript',
                      sttSessionId: message.sttSessionId,
                      kind: evt.kind,
                      text: evt.text,
                      speaker: evt.speaker,
                      words: evt.words,
                      language: evt.language,
                    });
                  });

                  session.onError((err) => {
                    send(ws, {
                      type: 'error',
                      sttSessionId: message.sttSessionId,
                      message: err.message,
                      code: 'adapter_error',
                    });
                  });

                  send(ws, {
                    type: 'ready',
                    sttSessionId: message.sttSessionId,
                    capabilityResolution: s.capabilityResolution,
                  });
                })
                .catch((err) => {
                  const code = err instanceof STTSessionError ? err.code : 'session_start_failed';
                  const msg = err instanceof Error ? err.message : 'Unknown error';
                  log.error(
                    { error: err, sttSessionId: message.sttSessionId },
                    'failed to start STT session',
                  );
                  send(ws, {
                    type: 'error',
                    sttSessionId: message.sttSessionId,
                    message: msg,
                    code,
                  });
                  ws.close(4000, code);
                });
              break;
            }

            case 'chunk': {
              if (!session || session.sttSessionId !== message.sttSessionId) return;
              session.feedAudio(message.source, {
                samplesB64: message.samplesB64,
                sampleRateHz: message.sampleRateHz,
                numSamples: message.numSamples,
                encoding: inputEncoding,
              });
              break;
            }

            case 'commit': {
              if (!session || session.sttSessionId !== message.sttSessionId) return;
              log.info({ sttSessionId: message.sttSessionId }, 'commit');
              session.commit();
              break;
            }

            case 'stop': {
              if (!session || session.sttSessionId !== message.sttSessionId) return;
              const currentSession = session;
              const sessionId = message.sttSessionId;
              session = null;
              log.info({ sttSessionId: sessionId }, 'stopping session');

              currentSession
                .stop()
                .then((result) => {
                  log.info(
                    { sttSessionId: sessionId, costUsd: result.costUsd, usage: result.usage },
                    'session done',
                  );
                  send(ws, {
                    type: 'done',
                    sttSessionId: sessionId,
                    costUsd: result.costUsd,
                    usage: result.usage,
                  });
                })
                .catch((err) => {
                  log.error({ error: err, sttSessionId: sessionId }, 'error stopping STT session');
                  send(ws, {
                    type: 'error',
                    sttSessionId: sessionId,
                    message: err instanceof Error ? err.message : 'Unknown error',
                    code: 'stop_failed',
                  });
                });
              break;
            }
          }
        },

        onClose() {
          log.info({ hasSession: !!session }, 'client WebSocket disconnected');
          if (session) {
            session.stop().catch((err) => {
              log.warn({ error: err }, 'error during session cleanup on WS close');
            });
            session = null;
          }
        },
      };
    }),
  );

  return router;
}
