import { CronExpressionParser } from 'cron-parser';

const DEFAULT_TIMEZONE = 'UTC';

export function validateCronExpression(expression: string): { valid: true } | { valid: false; error: string } {
  try {
    CronExpressionParser.parse(expression);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: Error.isError(e) ? e.message : 'Invalid cron expression' };
  }
}

export function getUpcomingCronRuns(expression: string, count: number, timezone: string = DEFAULT_TIMEZONE): Date[] {
  const interval = CronExpressionParser.parse(expression, { currentDate: new Date(), tz: timezone });
  return Array.from({ length: count }, () => interval.next().toDate());
}
