import { CronExpressionParser } from 'cron-parser';

const DEFAULT_TIMEZONE = 'UTC';

export function validateCronExpression(
  expression: string,
): { valid: true } | { valid: false; error: string } {
  try {
    CronExpressionParser.parse(expression);
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
  return CronExpressionParser.parse(expression, {
    currentDate: new Date(afterMs),
    tz: timezone,
  })
    .next()
    .toDate()
    .getTime();
}

export function getUpcomingCronRuns(
  expression: string,
  count: number,
  timezone: string = DEFAULT_TIMEZONE,
  afterMs: number = Date.now(),
): Date[] {
  const interval = CronExpressionParser.parse(expression, {
    currentDate: new Date(afterMs),
    tz: timezone,
  });
  return Array.from({ length: count }, () => interval.next().toDate());
}
