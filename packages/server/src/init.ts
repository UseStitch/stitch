import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initMailDb } from '@stitch/mail/db/client';

import { registerAdapters } from '@/adapters/index.js';
import { syncAllAutomationSchedules } from '@/automations/scheduler.js';
import { registerAllConnectors } from '@/connectors/definitions/index.js';
import { initConnectorRuntime } from '@/connectors/runtime.js';
import { getDb, initDb } from '@/db/client.js';
import { runPendingMigrations } from '@/db/lance-migrations.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';
import { registerMailProviders } from '@/mail/wiring.js';
import { refreshMcpToolsets } from '@/mcp/tool-executor.js';
import { syncDefaultPermissions } from '@/permission/default-permissions.js';
import { startScheduler } from '@/scheduler/runtime.js';
import { loadBuiltInSkills } from '@/skills/built-in-skills.js';
import { syncBuiltInSkills } from '@/skills/service.js';
import { registerDefaultToolsets } from '@/tools/toolsets/register-default-toolsets.js';

const log = Log.create({ service: 'init' });

function resolveMailMigrationsDir(): string {
  if (process.env.NODE_ENV === 'development') {
    const sourceMigrationsDir = fileURLToPath(new URL('../../mail/drizzle', import.meta.url));
    if (fs.existsSync(sourceMigrationsDir)) return sourceMigrationsDir;
  }

  return path.join(path.dirname(process.execPath), 'drizzle-mail');
}

export async function init() {
  await Log.init({});
  registerAdapters();

  await initDb();
  await initMailDb(PATHS.filePaths.mailDb, resolveMailMigrationsDir());
  await runPendingMigrations(getDb());

  const builtInSkills = await loadBuiltInSkills();
  await syncBuiltInSkills(builtInSkills);
  await syncDefaultPermissions();

  // Register built-in toolsets, then refresh MCP toolsets
  registerDefaultToolsets();
  await refreshMcpToolsets();

  // Register connector definitions and start token refresh
  registerAllConnectors();
  registerMailProviders();

  await initConnectorRuntime();

  await startScheduler();
  await syncAllAutomationSchedules();

  log.info('server initialized');
}
