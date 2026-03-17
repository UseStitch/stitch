import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 10_000;

export const eventsRouter = new Hono();
const log = Log.create({ service: 'events' });

eventsRouter.get('/', (c) => {
  return streamSSE(
    c,
    async (stream) => {
      Sse.registerConnection(stream);

      stream.onAbort(() => {
        Sse.unregisterConnection(stream);
      });

      await stream.writeSSE({
        event: 'connected',
        data: JSON.stringify({ ts: Date.now() }),
        retry: RECONNECT_DELAY_MS,
      });

      while (!stream.aborted) {
        await stream.sleep(HEARTBEAT_INTERVAL_MS);
        if (!stream.aborted) {
          await stream.writeSSE({
            event: 'heartbeat',
            data: JSON.stringify({ ts: Date.now() }),
          });
        }
      }
    },
    async (err) => {
      log.error({ error: err }, 'sse stream error');
    },
  );
});
