import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';

import { type StitchLogger } from '@stitch/shared/logger';

import * as Glob from '@/lib/glob.js';
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

function shouldLog(input: Level): boolean {
  return levelPriority[input] >= levelPriority[level];
}

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

const loggers = new Map<string, Logger>();

interface Options {
  print: boolean;
  dev?: boolean;
  level?: Level;
}

interface CleanupPlan {
  files: string[];
  maxFiles: number;
}

let logpath = '';
let logStream: ReturnType<typeof createWriteStream> | null = null;
let logOptions: Options | null = null;
let rotationPromise: Promise<void> | null = null;
const CLEANUP_THRESHOLD = 5;
const MAX_LOG_FILES = 10;
let nextRotationAt = Number.POSITIVE_INFINITY;
let rotationTimer: ReturnType<typeof setTimeout> | null = null;
let write: (msg: string) => number | Promise<number> = (msg: string) => {
  process.stderr.write(msg);
  return msg.length;
};

function getLogFilename(options: Options, now = new Date()): string {
  return options.dev ? 'dev.log' : `${now.toISOString().slice(0, 10)}.log`;
}

function getNextRotationAt(now = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function isProductionFileLogging(options: Options | null): options is Options {
  return Boolean(options && !options.dev && !options.print);
}

function getLogPath(options: Options, now = new Date()): string {
  return path.join(PATHS.logDir, getLogFilename(options, now));
}

function shouldRotate(options: Options, now: Date): boolean {
  if (!logStream) return true;
  if (options.dev) return !logpath;
  return now.getTime() >= nextRotationAt;
}

function resetLogState(): void {
  clearRotationTimer();
  logpath = '';
  nextRotationAt = Number.POSITIVE_INFINITY;
}

function createCleanupPlan(files: string[], dir: string): CleanupPlan {
  const preservedFilename =
    dir === PATHS.logDir && isProductionFileLogging(logOptions) ? getLogFilename(logOptions) : null;

  if (!preservedFilename) {
    return { files, maxFiles: MAX_LOG_FILES };
  }

  return {
    files: files.filter((file) => path.basename(file) !== preservedFilename),
    maxFiles: MAX_LOG_FILES - 1,
  };
}

function clearRotationTimer(): void {
  if (!rotationTimer) return;
  clearTimeout(rotationTimer);
  rotationTimer = null;
}

function scheduleRotation(options: Options): void {
  clearRotationTimer();
  if (options.dev || options.print || !Number.isFinite(nextRotationAt)) return;

  const delayMs = Math.max(0, nextRotationAt - Date.now());
  rotationTimer = setTimeout(() => {
    rotationTimer = null;
    if (!logOptions || logOptions.dev || logOptions.print) return;
    ensureLogStream(logOptions).catch(() => {});
  }, delayMs);
}

async function closeLogStream(): Promise<void> {
  const stream = logStream;
  logStream = null;
  if (!stream) return;

  await new Promise<void>((resolve) => {
    stream.end(() => resolve());
  });
}

async function ensureLogStream(options: Options): Promise<void> {
  const now = new Date();
  if (!shouldRotate(options, now)) {
    return;
  }

  const nextLogpath = getLogPath(options, now);
  if (nextLogpath === logpath && logStream) return;

  if (rotationPromise) {
    await rotationPromise;
  }
  if (nextLogpath === logpath && logStream) return;

  rotationPromise = (async () => {
    const rotationNow = new Date();
    const resolvedLogpath = getLogPath(options, rotationNow);
    if (resolvedLogpath === logpath && logStream) return;

    await fs.mkdir(PATHS.logDir, { recursive: true });
    if (options.dev) {
      await fs.writeFile(resolvedLogpath, '');
    } else {
      await fs.writeFile(resolvedLogpath, '', { flag: 'a' });
    }

    const nextStream = createWriteStream(resolvedLogpath, { flags: 'a' });
    await closeLogStream();
    logStream = nextStream;
    logpath = resolvedLogpath;
    nextRotationAt = options.dev ? Number.POSITIVE_INFINITY : getNextRotationAt(rotationNow);
    scheduleRotation(options);
  })().finally(() => {
    rotationPromise = null;
  });

  await rotationPromise;
}

export async function init(options: Options) {
  if (options.level) level = options.level;
  logOptions = options;
  await closeLogStream();
  resetLogState();
  await cleanup();
  if (options.print) return;
  await ensureLogStream(options);
  write = async (msg: string) => {
    if (logOptions) {
      await ensureLogStream(logOptions);
    }

    const stream = logStream;
    if (!stream) {
      process.stderr.write(msg);
      return msg.length;
    }

    return new Promise((resolve, reject) => {
      stream.write(msg, (err) => {
        if (err) reject(err);
        else resolve(msg.length);
      });
    });
  };
}

export async function cleanup(dir = PATHS.logDir) {
  const files = await Glob.scan('{????-??-??.log,????-??-??T??????.log}', {
    cwd: dir,
    absolute: true,
    include: 'file',
  });

  const plan = createCleanupPlan(files, dir);

  if (plan.files.length <= CLEANUP_THRESHOLD) return;

  const filesToDelete = plan.files.sort().slice(0, -plan.maxFiles);
  await Promise.all(filesToDelete.map((file) => fs.unlink(file).catch(() => {})));
}

function serializeError(error: Error, depth = 0): Record<string, any> {
  const result: Record<string, any> = {
    type: error.name,
    message: error.message,
    stack: error.stack,
  };
  if (error.cause instanceof Error && depth < 10) {
    result.cause = serializeError(error.cause, depth + 1);
  }
  return result;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) return serializeError(value);
  return value;
}

export function create(tags?: Record<string, unknown>) {
  tags = tags || {};

  const service = tags['service'];
  if (service && typeof service === 'string') {
    const cached = loggers.get(service);
    if (cached) return cached;
  }

  function emit(lvl: Level, extraOrMessage: Record<string, unknown> | string, message?: string) {
    if (!shouldLog(lvl)) return;

    const [extra, msg] =
      typeof extraOrMessage === 'string' ? [{}, extraOrMessage] : [extraOrMessage, message!];

    const entry: Record<string, unknown> = {
      level: lvl.toLowerCase(),
      time: new Date().toISOString(),
      msg,
    };

    for (const [key, value] of Object.entries({ ...tags, ...extra })) {
      if (value !== undefined && value !== null) {
        entry[key] = serializeValue(value);
      }
    }

    void write(JSON.stringify(entry) + '\n');
  }

  const result: Logger = {
    debug(extraOrMessage: Record<string, unknown> | string, message?: string) {
      emit('DEBUG', extraOrMessage, message);
    },
    info(extraOrMessage: Record<string, unknown> | string, message?: string) {
      emit('INFO', extraOrMessage, message);
    },
    warn(extraOrMessage: Record<string, unknown> | string, message?: string) {
      emit('WARN', extraOrMessage, message);
    },
    error(extraOrMessage: Record<string, unknown> | string, message?: string) {
      emit('ERROR', extraOrMessage, message);
    },
    tag(key: string, value: string) {
      if (tags) tags[key] = value;
      return result;
    },
    clone() {
      return create({ ...tags });
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
