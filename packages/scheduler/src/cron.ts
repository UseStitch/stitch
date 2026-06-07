type CronParts = {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
};

const MAX_SCAN_MINUTES = 60 * 24 * 366;
const DEFAULT_TIMEZONE = 'UTC';

type DateParts = {
  minute: number;
  hour: number;
  day: number;
  month: number;
  dayOfWeek: number;
};

function parseIntPart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Unable to read ${type} from formatted date`);
  return Number(value);
}

function getDateParts(at: Date, formatter: Intl.DateTimeFormat): DateParts {
  const parts = formatter.formatToParts(at);
  const year = parseIntPart(parts, 'year');
  const month = parseIntPart(parts, 'month');
  const day = parseIntPart(parts, 'day');

  return {
    minute: parseIntPart(parts, 'minute'),
    hour: parseIntPart(parts, 'hour'),
    day,
    month,
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function createFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseField(
  raw: string,
  min: number,
  max: number,
  normalize?: (value: number) => number,
): Set<number> {
  const values = new Set<number>();

  function addValue(value: number, source: string): void {
    const normalized = normalize ? normalize(value) : value;
    if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
      throw new Error(`Invalid cron value: ${source}`);
    }
    values.add(normalized);
  }

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
      for (let i = start; i <= end; i++) addValue(i, part);
      continue;
    }

    const value = Number(part);
    if (!Number.isInteger(value)) {
      throw new Error(`Invalid cron value: ${part}`);
    }
    addValue(value, part);
  }

  return values;
}

function parseDayOfWeekField(raw: string): Set<number> {
  return parseField(raw, 0, 6, (value) => (value === 7 ? 0 : value));
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
    dayOfWeek: parseDayOfWeekField(fields[4]),
  };
}

function matchesCron(parts: CronParts, at: Date, formatter: Intl.DateTimeFormat): boolean {
  const dateParts = getDateParts(at, formatter);

  return (
    parts.minute.has(dateParts.minute) &&
    parts.hour.has(dateParts.hour) &&
    parts.dayOfMonth.has(dateParts.day) &&
    parts.month.has(dateParts.month) &&
    parts.dayOfWeek.has(dateParts.dayOfWeek)
  );
}

export function validateCronExpression(
  expression: string,
): { valid: true } | { valid: false; error: string } {
  try {
    parseCron(expression);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : 'Invalid cron expression' };
  }
}

export function getNextCronRunMs(
  expression: string,
  afterMs: number,
  timezone: string = DEFAULT_TIMEZONE,
): number {
  const parts = parseCron(expression);
  const formatter = createFormatter(timezone);
  const cursor = new Date(afterMs);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  for (let i = 0; i < MAX_SCAN_MINUTES; i++) {
    if (matchesCron(parts, cursor, formatter)) return cursor.getTime();
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  throw new Error(
    `Unable to find next cron run within ${MAX_SCAN_MINUTES} minutes for "${expression}"`,
  );
}
