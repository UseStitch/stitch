import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { init } from './init.js';
import { chatRouter } from './routes/chat.js';
import { eventsRouter } from './routes/events.js';
import { providerRouter } from './routes/provider.js';
import { settingsRouter } from './routes/settings.js';
import { shortcutsRouter } from './routes/shortcuts.js';
import { questionsRouter } from './routes/questions.js';
import { PATHS } from './lib/paths.js';
import { registerShutdownHandlers } from './shutdown.js';

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

const app = new Hono();

app.use(cors());
app.get('/health', (c) =>
  c.json({ status: 'ok', paths: PATHS }),
);
app.route('/chat', chatRouter);
app.route('/chat', questionsRouter);
app.route('/events', eventsRouter);
app.route('/provider', providerRouter);
app.route('/settings', settingsRouter);
app.route('/shortcuts', shortcutsRouter);

registerShutdownHandlers();
await init();

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`server:ready http://${info.address}:${info.port}`);
});
