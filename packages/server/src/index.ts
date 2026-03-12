import { Hono } from 'hono';
import { init } from './init.js';
import { registerShutdownHandlers } from './shutdown.js';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

registerShutdownHandlers();
await init();

export default {
  port: 3000,
  fetch: app.fetch,
};
