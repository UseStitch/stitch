import type { CronSchedule } from './types.js';

type CronParts = {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
};

const MAX_SCAN_MINUTES = 60 * 24 * 366;

function parseField(raw: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of raw.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    if (part.startsWith('*/')) {
      const step = Number(part.slice(2));
      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`Invalid cron step: ${part}`);
      }
      for (let i = min; i <= max; i += step) values.add(i);
      continue;
    }

    if (part.includes('-')) {
      const [startRaw, endRaw] = part.split('-');
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
        throw new Error(`Invalid cron range: ${part}`);
      }
      if (start < min || end > max) throw new Error(`Cron range out of bounds: ${part}`);
      for (let i = start; i <= end; i++) values.add(i);
      continue;
    }

    const value = Number(part);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`Invalid cron value: ${part}`);
    }
    values.add(value);
  }

  return values;
}

function parseCron(expression: string): CronParts {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression "${expression}": expected 5 fields`);
  }

  return {
    minute: parseField(fields[0], 0, 59),
    hour: parseField(fields[1], 0, 23),
    dayOfMonth: parseField(fields[2], 1, 31),
    month: parseField(fields[3], 1, 12),
    dayOfWeek: parseField(fields[4], 0, 6),
  };
}

function matchesCron(parts: CronParts, at: Date, timezone: CronSchedule['timezone']): boolean {
  const minute = timezone === 'local' ? at.getMinutes() : at.getUTCMinutes();
  const hour = timezone === 'local' ? at.getHours() : at.getUTCHours();
  const day = timezone === 'local' ? at.getDate() : at.getUTCDate();
  const month = (timezone === 'local' ? at.getMonth() : at.getUTCMonth()) + 1;
  const dayOfWeek = timezone === 'local' ? at.getDay() : at.getUTCDay();

  return (
    parts.minute.has(minute) &&
    parts.hour.has(hour) &&
    parts.dayOfMonth.has(day) &&
    parts.month.has(month) &&
    parts.dayOfWeek.has(dayOfWeek)
  );
}

export function getNextCronRunMs(expression: string, afterMs: number, timezone: 'UTC' | 'local'): number {
  const parts = parseCron(expression);
  const cursor = new Date(afterMs);

  if (timezone === 'local') {
    cursor.setSeconds(0, 0);
    cursor.setMinutes(cursor.getMinutes() + 1);
  } else {
    cursor.setUTCSeconds(0, 0);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  for (let i = 0; i < MAX_SCAN_MINUTES; i++) {
    if (matchesCron(parts, cursor, timezone)) return cursor.getTime();
    if (timezone === 'local') cursor.setMinutes(cursor.getMinutes() + 1);
    else cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  throw new Error(`Unable to find next cron run within ${MAX_SCAN_MINUTES} minutes for "${expression}"`);
}
