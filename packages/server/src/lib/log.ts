import { createWriteStream, type WriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';

import { type StitchLogger } from '@stitch/shared/logger';

import { PATHS } from '@/lib/paths.js';

const Level = z
  .enum(['DEBUG', 'INFO', 'WARN', 'ERROR'])
  .meta({ ref: 'LogLevel', description: 'Log level' });
type Level = z.infer<typeof Level>;

const levelPriority: Record<Level, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let level: Level = 'INFO';

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

function shouldLog(input: Level): boolean {
  return levelPriority[input] >= levelPriority[level];
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatError(error: Error, depth = 0): string {
  const message = error.message;
  return error.cause instanceof Error && depth < 10
    ? `${message} Caused by: ${formatError(error.cause, depth + 1)}`
    : message;
}

function formatValue(value: unknown): string {
  if (value instanceof Error) return formatError(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'symbol') return value.description ?? value.toString();
  if (typeof value === 'function') return value.name ? `[Function ${value.name}]` : '[Function]';
  if (typeof value === 'object') return JSON.stringify(value);
  return '';
}

let stream: WriteStream | undefined;
let currentDate: string | undefined;
let prefix = 'app';
let initialized = false;
let last = Date.now();
const loggers = new Map<string, Logger>();

function openStream(date: string): void {
  const logFile = path.join(PATHS.logDir, `${prefix}.${date}.1.log`);
  stream?.end();
  stream = createWriteStream(logFile, { flags: 'a' });
  currentDate = date;
}

function write(msg: string): void {
  if (!initialized) return;
  const today = formatDate(new Date());
  if (today !== currentDate) openStream(today);
  stream?.write(msg);
}

export async function init(options: Options): Promise<void> {
  level = options.level ?? 'INFO';
  prefix = options.dev ? 'dev' : 'app';

  await fs.mkdir(PATHS.logDir, { recursive: true });

  openStream(formatDate(new Date()));
  initialized = true;
}

// Log filename format: <prefix>.<date>.<count>.log
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

  function build(message: string, extra?: Record<string, unknown>) {
    const prefix = Object.entries({ ...tags, ...extra })
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(' ');

    const next = new Date();
    const diff = next.getTime() - last;
    last = next.getTime();

    return [next.toISOString().split('.')[0], `+${diff}ms`, prefix, message]
      .filter(Boolean)
      .join(' ');
  }

  function emit(lvl: Level, extraOrMessage: Record<string, unknown> | string, message?: string) {
    if (!shouldLog(lvl)) return;

    if (typeof extraOrMessage === 'string') {
      write(`${lvl} ${build(extraOrMessage)}\n`);
    } else {
      write(`${lvl} ${build(message ?? '', extraOrMessage)}\n`);
    }
  }

  const result: Logger = {
    debug(extraOrMessage, message?) {
      emit('DEBUG', extraOrMessage, message as string | undefined);
    },
    info(extraOrMessage, message?) {
      emit('INFO', extraOrMessage, message as string | undefined);
    },
    warn(extraOrMessage, message?) {
      emit('WARN', extraOrMessage, message as string | undefined);
    },
    error(extraOrMessage, message?) {
      emit('ERROR', extraOrMessage, message as string | undefined);
    },
    tag(key: string, value: string) {
      tags = { ...tags, [key]: value };
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
