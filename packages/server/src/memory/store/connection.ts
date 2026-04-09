import * as lancedb from '@lancedb/lancedb';
import path from 'node:path';

import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'memory-store' });

let connection: lancedb.Connection | null = null;

function getMemoryDbPath(): string {
  return path.join(PATHS.dataDir, 'memory.lance');
}

export async function getConnection(): Promise<lancedb.Connection> {
  if (connection) return connection;

  const dbPath = getMemoryDbPath();
  log.info({ path: dbPath }, 'connecting to memory store');
  connection = await lancedb.connect(dbPath);
  return connection;
}
