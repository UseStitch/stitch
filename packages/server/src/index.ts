import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { init } from './init.js';
import { providerRouter } from './routes/provider.js';
import { registerShutdownHandlers } from './shutdown.js';

const PORT = 3000;

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/provider', providerRouter);

registerShutdownHandlers();
await init();

serve({ fetch: app.fetch, port: PORT });
