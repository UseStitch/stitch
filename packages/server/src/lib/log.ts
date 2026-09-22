import { createWriteStream, type WriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';

import type { JsonValue } from '@stitch/shared/json';
import { type StitchLogger } from '@stitch/shared/logger';

import { PATHS } from '@/lib/paths.js';

const Level = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).meta({ ref: 'LogLevel', description: 'Log level' });
type Level = z.infer<typeof Level>;
type LogContext = Record<string, Error | JsonValue | undefined>;

const levelPriority: Record<Level, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

let level: Level = 'INFO';

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

// Boundary decoder: each member formats its domain directly, so callers branch
// on the parsed result instead of narrowing the representation with typeof.
// Member order matters: the unknown fallback must stay last.
const formatValueSchema = z.union([
  z.string(),
  z.number().transform((n) => n.toString()),
  z.boolean().transform((b) => b.toString()),
  z.bigint().transform((b) => b.toString()),
  z.symbol().transform((s) => s.description ?? s.toString()),
  z
    .custom<(...args: never[]) => void>((v) => v instanceof Function)
    .transform((fn) => (fn.name ? `[Function ${fn.name}]` : '[Function]')),
  z.undefined().transform(() => ''),
  z.unknown().transform((v) => JSON.stringify(v)),
]);

// Boundary decoder: reads the optional service tag without typeof narrowing.
const createServiceSchema = z.looseObject({ service: z.string().optional().catch(undefined) });

// Boundary decoder: discriminates the emit argument into a domain value.
const emitArgSchema = z.union([
  z.string().transform((message) => ({ kind: 'message', message }) as const),
  z
    .record(z.string(), z.union([z.instanceof(Error), z.json(), z.undefined()]))
    .transform((extra) => ({ kind: 'extra', extra }) as const),
]);

function formatValue(value: unknown): string {
  if (Error.isError(value)) {
    const { message, name } = value;
    const cause = Object.getOwnPropertyDescriptor(value, 'cause')?.value;
    const obj = { name, message, ...Object.fromEntries(Object.entries(value)) };
    if (cause === undefined) return JSON.stringify(obj);
    return JSON.stringify({ ...obj, cause: Error.isError(cause) ? cause.message : cause });
  }
  return formatValueSchema.parse(value);
}

let stream: WriteStream | undefined;
let currentDate: string | undefined;
let prefix = 'app';
let initialized = false;
let last = Date.now();
const loggers = new Map<string, StitchLogger>();

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

export async function close(): Promise<void> {
  const current = stream;
  stream = undefined;
  currentDate = undefined;
  initialized = false;
  if (!current) return;
  await new Promise<void>((resolve) => current.end(resolve));
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

  const logFiles = entries.filter((f) => LOG_FILE_PATTERN.test(f)).toSorted();

  if (logFiles.length <= 10) return;

  const toDelete = logFiles.slice(0, logFiles.length - 10);
  await Promise.all(toDelete.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})));
}

export function create(tags?: LogContext, { skipCache = false } = {}): StitchLogger {
  tags = tags ?? {};

  const parsedTags = createServiceSchema.safeParse(tags);
  const service = parsedTags.success ? parsedTags.data.service : undefined;
  if (!skipCache && service) {
    const cached = loggers.get(service);
    if (cached) return cached;
  }

  function build(message: string, extra?: LogContext) {
    const prefix = Object.entries({ ...tags, ...extra })
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(' ');

    const next = new Date();
    const diff = next.getTime() - last;
    last = next.getTime();

    return [next.toISOString().split('.').at(0), `+${diff}ms`, prefix, message].filter(Boolean).join(' ');
  }

  function emit(lvl: Level, extraOrMessage: LogContext | string, message?: string) {
    if (!shouldLog(lvl)) return;

    const parsedArg = emitArgSchema.safeParse(extraOrMessage);
    if (!parsedArg.success) {
      write(`${lvl} ${build(message ?? '', {})}\n`);
      return;
    }

    const arg = parsedArg.data;
    if (arg.kind === 'message') {
      write(`${lvl} ${build(arg.message)}\n`);
    } else {
      write(`${lvl} ${build(message ?? '', arg.extra)}\n`);
    }
  }

  const result: StitchLogger = {
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
  };

  if (service) {
    loggers.set(service, result);
  }

  return result;
}
