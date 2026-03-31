import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { init } from '@/init.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { browserRouter } from '@/routes/browser.js';
import { chatRouter } from '@/routes/chat.js';
import { configRouter } from '@/routes/config.js';
import { eventsRouter } from '@/routes/events.js';
import { mcpRouter } from '@/routes/mcp.js';
import { meetingsRouter } from '@/routes/meetings.js';
import { modelsRouter } from '@/routes/models.js';
import { permissionsRouter } from '@/routes/permissions.js';
import { providerRouter } from '@/routes/provider.js';
import { questionsRouter } from '@/routes/questions.js';
import { queueRouter } from '@/routes/queue.js';
import { settingsRouter } from '@/routes/settings.js';
import { shortcutsRouter } from '@/routes/shortcuts.js';
import { usageRouter } from '@/routes/usage.js';
import { connectorsRouter } from '@/routes/connectors.js';
import { registerShutdownHandlers } from '@/shutdown.js';

function parseArgs() {
  const args = process.argv.slice(2);
  let port = Number(process.env['PORT']) || 3000;
  let hostname = process.env['HOSTNAME'] || '127.0.0.1';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--hostname' && args[i + 1]) {
      hostname = args[i + 1]!;
      i++;
    }
  }

  return { port, hostname };
}

const { port, hostname } = parseArgs();
const log = Log.create({ service: 'server' });

const app = new Hono();

app.use(cors());
app.get('/health', (c) => c.json({ status: 'ok', paths: PATHS }));
app.route('/browser', browserRouter);
app.route('/chat', chatRouter);
app.route('/chat', questionsRouter);
app.route('/chat', permissionsRouter);
app.route('/chat', queueRouter);
app.route('/config', configRouter);
app.route('/events', eventsRouter);
app.route('/mcp', mcpRouter);
app.route('/meetings', meetingsRouter);
app.route('/models', modelsRouter);
app.route('/provider', providerRouter);
app.route('/settings', settingsRouter);
app.route('/shortcuts', shortcutsRouter);
app.route('/usage', usageRouter);
app.route('/connectors', connectorsRouter);

registerShutdownHandlers();
await init();

serve({ fetch: app.fetch, port, hostname }, (info) => {
  log.info({ address: info.address, port: info.port }, 'server ready');
});
