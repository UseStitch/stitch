import fs from 'fs/promises';
import path from 'path';
import pino from 'pino';
import z from 'zod';

import { type StitchLogger } from '@stitch/shared/logger';

import { PATHS } from '@/lib/paths.js';

const Level = z
  .enum(['DEBUG', 'INFO', 'WARN', 'ERROR'])
  .meta({ ref: 'LogLevel', description: 'Log level' });
type Level = z.infer<typeof Level>;

const pinoLevel: Record<Level, pino.Level> = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
};

type Logger = StitchLogger & {
  tag(key: string, value: string): Logger;
  clone(): Logger;
  time(
    message: string,
    extra?: Record<string, unknown>,
  ): {
    stop(): void;
    [Symbol.dispose](): void;
  };
};

interface Options {
  dev?: boolean;
  level?: Level;
}

// Silent by default until init() is called — nothing goes to stdout/stderr before then
let rootLogger: pino.Logger = pino({ level: 'silent' });
const loggers = new Map<string, Logger>();

export async function init(options: Options): Promise<void> {
  const level = pinoLevel[options.level ?? 'INFO'];

  loggers.clear();

  await fs.mkdir(PATHS.logDir, { recursive: true });

  const fileBase = path.join(PATHS.logDir, options.dev ? 'dev' : 'app');

  rootLogger = pino(
    { level },
    pino.transport({
      target: 'pino-roll',
      options: {
        file: fileBase,
        extension: '.log',
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
        mkdir: true,
        limit: { count: 9 },
        // SonicBoom flushes synchronously on process exit — no lost entries on crash
        sync: false,
      },
    }),
  );
}

// Matches pino-roll's "Extension Last" filename format: <name>.<date>.<count>.log
// e.g. app.2025-08-19.1.log or dev.2025-08-19.1.log
const LOG_FILE_PATTERN = /^.+\.\d{4}-\d{2}-\d{2}\.\d+\.log$/;

export async function cleanup(dir = PATHS.logDir): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  const logFiles = entries.filter((f) => LOG_FILE_PATTERN.test(f)).sort();

  if (logFiles.length <= 10) return;

  const toDelete = logFiles.slice(0, logFiles.length - 10);
  await Promise.all(toDelete.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})));
}

export function create(tags?: Record<string, unknown>, { skipCache = false } = {}): Logger {
  tags = tags ?? {};

  const service = tags['service'];
  if (!skipCache && service && typeof service === 'string') {
    const cached = loggers.get(service);
    if (cached) return cached;
  }

  let child = rootLogger.child(tags);

  function emit(
    lvl: pino.Level,
    extraOrMessage: Record<string, unknown> | string,
    message?: string,
  ) {
    if (typeof extraOrMessage === 'string') {
      child[lvl](extraOrMessage);
    } else {
      child[lvl](extraOrMessage, message ?? '');
    }
  }

  const result: Logger = {
    debug(extraOrMessage, message?) {
      emit('debug', extraOrMessage, message as string | undefined);
    },
    info(extraOrMessage, message?) {
      emit('info', extraOrMessage, message as string | undefined);
    },
    warn(extraOrMessage, message?) {
      emit('warn', extraOrMessage, message as string | undefined);
    },
    error(extraOrMessage, message?) {
      emit('error', extraOrMessage, message as string | undefined);
    },
    tag(key: string, value: string) {
      tags = { ...tags, [key]: value };
      child = rootLogger.child(tags);
      return result;
    },
    clone() {
      return create({ ...tags }, { skipCache: true });
    },
    time(message: string, extra?: Record<string, unknown>) {
      const now = Date.now();
      result.info({ status: 'started', ...extra }, message);
      function stop() {
        result.info({ status: 'completed', duration: Date.now() - now, ...extra }, message);
      }
      return {
        stop,
        [Symbol.dispose]() {
          stop();
        },
      };
    },
  };

  if (service && typeof service === 'string') {
    loggers.set(service, result);
  }

  return result;
}
