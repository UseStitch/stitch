import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';

import * as Glob from "@/lib/glob.js";
import { PATHS } from "@/lib/paths.js";

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
  debug(message?: any, extra?: Record<string, any>): void;
  info(message?: any, extra?: Record<string, any>): void;
  error(message?: any, extra?: Record<string, any>): void;
  warn(message?: any, extra?: Record<string, any>): void;
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

function formatError(error: Error, depth = 0): string {
  const result = error.message;
  return error.cause instanceof Error && depth < 10
    ? result + ' Caused by: ' + formatError(error.cause, depth + 1)
    : result;
}

let last = Date.now();
export function create(tags?: Record<string, any>) {
  tags = tags || {};

  const service = tags['service'];
  if (service && typeof service === 'string') {
    const cached = loggers.get(service);
    if (cached) {
      return cached;
    }
  }

  function build(message: any, extra?: Record<string, any>) {
    const prefix = Object.entries({
      ...tags,
      ...extra,
    })
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        const prefix = `${key}=`;
        if (value instanceof Error) return prefix + formatError(value);
        if (typeof value === 'object') return prefix + JSON.stringify(value);
        return prefix + value;
      })
      .join(' ');
    const next = new Date();
    const diff = next.getTime() - last;
    last = next.getTime();
    return (
      [next.toISOString().split('.')[0], '+' + diff + 'ms', prefix, message]
        .filter(Boolean)
        .join(' ') + '\n'
    );
  }
  const result: Logger = {
    debug(message?: any, extra?: Record<string, any>) {
      if (shouldLog('DEBUG')) {
        write('DEBUG ' + build(message, extra));
      }
    },
    info(message?: any, extra?: Record<string, any>) {
      if (shouldLog('INFO')) {
        write('INFO  ' + build(message, extra));
      }
    },
    error(message?: any, extra?: Record<string, any>) {
      if (shouldLog('ERROR')) {
        write('ERROR ' + build(message, extra));
      }
    },
    warn(message?: any, extra?: Record<string, any>) {
      if (shouldLog('WARN')) {
        write('WARN  ' + build(message, extra));
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
      result.info(message, { status: 'started', ...extra });
      function stop() {
        result.info(message, {
          status: 'completed',
          duration: Date.now() - now,
          ...extra,
        });
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
