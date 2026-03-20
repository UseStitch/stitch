import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';

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

type Logger = {
  debug(extra: Record<string, any>, message: string): void;
  debug(message: string): void;
  info(extra: Record<string, any>, message: string): void;
  info(message: string): void;
  error(extra: Record<string, any>, message: string): void;
  error(message: string): void;
  warn(extra: Record<string, any>, message: string): void;
  warn(message: string): void;
  tag(key: string, value: string): Logger;
  clone(): Logger;
  time(
    message: string,
    extra?: Record<string, any>,
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

let logpath = '';
let write = (msg: any) => {
  process.stderr.write(msg);
  return msg.length;
};

export async function init(options: Options) {
  if (options.level) level = options.level;
  await cleanup();
  if (options.print) return;
  logpath = path.join(
    PATHS.logDir,
    options.dev ? 'dev.log' : new Date().toISOString().split('.')[0].replace(/:/g, '') + '.log',
  );
  await fs.mkdir(PATHS.logDir, { recursive: true });
  await fs.writeFile(logpath, '');
  const stream = createWriteStream(logpath, { flags: 'a' });
  write = async (msg: any) => {
    return new Promise((resolve, reject) => {
      stream.write(msg, (err) => {
        if (err) reject(err);
        else resolve(msg.length);
      });
    });
  };
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

export function create(tags?: Record<string, any>) {
  tags = tags || {};

  const service = tags['service'];
  if (service && typeof service === 'string') {
    const cached = loggers.get(service);
    if (cached) {
      return cached;
    }
  }

  function build(lvl: string, extra: Record<string, any>, message: string) {
    const entry: Record<string, unknown> = {
      level: lvl,
      time: new Date().toISOString(),
      msg: message,
    };

    for (const [key, value] of Object.entries({ ...tags, ...extra })) {
      if (value !== undefined && value !== null) {
        entry[key] = serializeValue(value);
      }
    }

    return JSON.stringify(entry) + '\n';
  }

  const result: Logger = {
    debug(extraOrMessage: Record<string, any> | string, message?: string) {
      if (shouldLog('DEBUG')) {
        const [extra, msg] =
          typeof extraOrMessage === 'string' ? [{}, extraOrMessage] : [extraOrMessage, message!];
        write(build('debug', extra, msg));
      }
    },
    info(extraOrMessage: Record<string, any> | string, message?: string) {
      if (shouldLog('INFO')) {
        const [extra, msg] =
          typeof extraOrMessage === 'string' ? [{}, extraOrMessage] : [extraOrMessage, message!];
        write(build('info', extra, msg));
      }
    },
    error(extraOrMessage: Record<string, any> | string, message?: string) {
      if (shouldLog('ERROR')) {
        const [extra, msg] =
          typeof extraOrMessage === 'string' ? [{}, extraOrMessage] : [extraOrMessage, message!];
        write(build('error', extra, msg));
      }
    },
    warn(extraOrMessage: Record<string, any> | string, message?: string) {
      if (shouldLog('WARN')) {
        const [extra, msg] =
          typeof extraOrMessage === 'string' ? [{}, extraOrMessage] : [extraOrMessage, message!];
        write(build('warn', extra, msg));
      }
    },
    tag(key: string, value: string) {
      if (tags) tags[key] = value;
      return result;
    },
    clone() {
      return create({ ...tags });
    },
    time(message: string, extra?: Record<string, any>) {
      const now = Date.now();
      result.info({ status: 'started', ...extra }, message);
      function stop() {
        result.info(
          {
            status: 'completed',
            duration: Date.now() - now,
            ...extra,
          },
          message,
        );
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
