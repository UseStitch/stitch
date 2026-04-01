import os from 'node:os';
import path from 'node:path';

const workerId = process.env['VITEST_WORKER_ID'] ?? process.pid.toString();
const dbFile = `stitch-server-vitest-${workerId}.sqlite`;

if (!process.env['STITCH_DB_PATH']) {
  process.env['STITCH_DB_PATH'] = path.join(os.tmpdir(), dbFile);
}
