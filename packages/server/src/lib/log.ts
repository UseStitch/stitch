import fs from 'fs/promises';
import path from 'path';
import pino from 'pino';
import z from 'zod';

import * as Glob from '@/lib/glob.js';
import { PATHS } from '@/lib/paths.js';

const Level = z
  .enum(['DEBUG', 'INFO', 'WARN', 'ERROR'])
  .meta({ ref: 'LogLevel', description: 'Log level' });
type Level = z.infer<typeof Level>;

interface Options {
  print: boolean;
  dev?: boolean;
  level?: Level;
}

let level: Level = 'INFO';

function toPinoLevel(input: Level): pino.LevelWithSilent {
  return input.toLowerCase() as pino.LevelWithSilent;
}

function createBaseLogger(destination: pino.DestinationStream): pino.Logger {
  return pino(
    {
      level: toPinoLevel(level),
      base: undefined,
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
      },
    },
    destination,
  );
}

let logger = createBaseLogger(pino.destination({ fd: 2, sync: false }));

export async function init(options: Options) {
  if (options.level) level = options.level;
  await cleanup();

  const logFilePath = path.join(
    PATHS.logDir,
    options.dev ? 'dev.log' : new Date().toISOString().split('.')[0].replace(/:/g, '') + '.log',
  );

  const destination = options.print
    ? pino.destination({ fd: 2, sync: false })
    : await createFileDestination(logFilePath);

  logger = createBaseLogger(destination);
}

async function createFileDestination(filepath: string): Promise<pino.DestinationStream> {
  await fs.mkdir(PATHS.logDir, { recursive: true });
  await fs.writeFile(filepath, '');
  return pino.destination({ dest: filepath, sync: false });
}

export async function cleanup(dir = PATHS.logDir) {
  const files = await Glob.scan('????-??-??T??????.log', {
    cwd: dir,
    absolute: true,
    include: 'file',
  });
  if (files.length <= 5) return;

  const filesToDelete = files.sort().slice(0, -10);
  await Promise.all(filesToDelete.map((file) => fs.unlink(file).catch(() => {})));
}

export function create(bindings: Record<string, unknown> = {}): pino.Logger {
  return logger.child(bindings);
}
