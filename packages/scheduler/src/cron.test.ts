import { describe, expect, test } from 'bun:test';

import { getNextCronRunMs, validateCronExpression } from './cron.js';

describe('cron', () => {
  test('evaluates schedules in IANA timezones', () => {
    const afterMs = new Date('2026-01-01T13:59:00.000Z').getTime();

    const nextRunMs = getNextCronRunMs('0 9 * * *', afterMs, 'America/New_York');

    expect(new Date(nextRunMs).toISOString()).toBe('2026-01-01T14:00:00.000Z');
  });

  test('accepts 7 as Sunday in day-of-week field', () => {
    expect(validateCronExpression('0 9 * * 7')).toEqual({ valid: true });

    const afterMs = new Date('2026-01-03T00:00:00.000Z').getTime();
    const nextRunMs = getNextCronRunMs('0 9 * * 7', afterMs, 'UTC');

    expect(new Date(nextRunMs).toISOString()).toBe('2026-01-04T09:00:00.000Z');
  });
});
