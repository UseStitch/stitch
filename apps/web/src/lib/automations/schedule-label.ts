import type { AutomationSchedule } from '@stitch/shared/automations/types';

const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

function formatTime(hourRaw: string, minuteRaw: string): string {
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return `${hourRaw}:${minuteRaw}`;
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toNumberList(raw: string): number[] | null {
  if (raw === '*') return [];
  const list = raw.split(',').map((part) => Number.parseInt(part, 10));
  if (list.some((value) => Number.isNaN(value))) return null;
  return list;
}

function formatCron(expression: string): string {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return `Custom cron: ${expression}`;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Hourly at :${minute.padStart(2, '0')}`;
  }

  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${formatTime(hour, minute)}`;
  }

  if (dayOfMonth === '*' && month === '*') {
    const days = toNumberList(dayOfWeek);
    if (days) {
      const labels = days.length === 0 ? 'every day' : days.map((day) => WEEKDAY_LABELS[day] ?? `${day}`).join(', ');
      return `Weekly on ${labels} at ${formatTime(hour, minute)}`;
    }
  }

  if (month === '*' && dayOfWeek === '*') {
    return `Monthly on day ${dayOfMonth} at ${formatTime(hour, minute)}`;
  }

  return `Custom cron: ${expression}`;
}

export function getAutomationScheduleLabel(schedule: AutomationSchedule | null): string {
  if (!schedule) return 'Manual';

  if (schedule.type === 'interval') {
    return `Every ${schedule.everyMinutes} minute${schedule.everyMinutes === 1 ? '' : 's'}`;
  }

  return formatCron(schedule.expression);
}
