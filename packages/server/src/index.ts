import { Hono } from 'hono';
import { Log } from './lib/log.js';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

Log.Default.info('server starting', { port: 3000 });

export default {
  port: 3000,
  fetch: app.fetch,
};
