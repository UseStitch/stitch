import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { Server as HttpServer } from 'node:http';

import { init } from '@/init.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { agendaRouter } from '@/routes/agenda.js';
import { automationsRouter } from '@/routes/automations.js';
import { chatRouter } from '@/routes/chat.js';
import { configRouter } from '@/routes/config.js';
import { connectorsRouter } from '@/routes/connectors.js';
import { eventsRouter } from '@/routes/events.js';
import { iconsRouter } from '@/routes/icons.js';
import { modelsRouter } from '@/routes/llm-models.js';
import { providerRouter } from '@/routes/llm-provider.js';
import { localModelsRouter } from '@/routes/local-models.js';
import { mailRouter } from '@/routes/mail.js';
import { mcpElicitationsRouter } from '@/routes/mcp-elicitations.js';
import { mcpRouter } from '@/routes/mcp.js';
import { memoryRouter } from '@/routes/memory.js';
import { permissionsRouter } from '@/routes/permissions.js';
import { providersRouter } from '@/routes/providers.js';
import { questionsRouter } from '@/routes/questions.js';
import { recordingsRouter } from '@/routes/recordings.js';
import { settingsRouter } from '@/routes/settings.js';
import { shortcutsRouter } from '@/routes/shortcuts.js';
import { skillsRouter } from '@/routes/skills.js';
import { usageRouter } from '@/routes/usage.js';
import { registerShutdownHandlers } from '@/shutdown.js';
import { initSttAdapters } from '@/stt/init.js';
import { createSttRouter } from '@/stt/route.js';

const SOCKET_KEEPALIVE_DELAY_MS = 15_000;

function parseArgs() {
  const args = process.argv.slice(2);
  let port = Number(process.env['PORT']) || 3000;
  let hostname = process.env['HOSTNAME'] || '127.0.0.1';

  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === '--port' && next) {
      port = Number(next);
      i++;
    } else if (args[i] === '--hostname' && next) {
      hostname = next;
      i++;
    }
  }

  return { port, hostname };
}

const { port, hostname } = parseArgs();
const log = Log.create({ service: 'server' });

const app = new Hono();
const nodeWebSocket = createNodeWebSocket({ app });

app.use(cors({ origin: '*', allowHeaders: ['Content-Type'], exposeHeaders: [] }));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  log.error({ err }, 'Unhandled server error');
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.get('/health', (c) => c.json({ status: 'ok', paths: PATHS }));
app.route('/automations', automationsRouter);
app.route('/chat', chatRouter);
app.route('/chat', questionsRouter);
app.route('/chat', mcpElicitationsRouter);
app.route('/chat', permissionsRouter);
app.route('/config', configRouter);
app.route('/events', eventsRouter);
app.route('/icons', iconsRouter);
app.route('/mcp', mcpRouter);
app.route('/memory', memoryRouter);
app.route('/mail', mailRouter);
app.route('/llm/models', modelsRouter);
app.route('/llm/provider', providerRouter);
app.route('/llm/local/:provider/models', localModelsRouter);
app.route('/providers', providersRouter);
app.route('/settings', settingsRouter);
app.route('/skills', skillsRouter);
app.route('/recordings', recordingsRouter);
app.route('/shortcuts', shortcutsRouter);
app.route('/usage', usageRouter);
app.route('/connectors', connectorsRouter);
app.route('/agenda', agendaRouter);
app.route('/stt', createSttRouter(nodeWebSocket.upgradeWebSocket));

initSttAdapters();
registerShutdownHandlers();
await init();

const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  log.info({ address: info.address, port: info.port }, 'server ready');
});

if (server instanceof HttpServer) {
  // Long-lived SSE streams sit idle between events, so a peer that vanishes
  // without a TCP FIN (sleep, network switch) would otherwise linger for the OS
  // default (2h on Windows). Socket keepalive makes the kernel reap it, which
  // closes the response and lets the SSE adapter drop the connection.
  server.on('connection', (socket) => {
    socket.setKeepAlive(true, SOCKET_KEEPALIVE_DELAY_MS);
  });
}

nodeWebSocket.injectWebSocket(server);
