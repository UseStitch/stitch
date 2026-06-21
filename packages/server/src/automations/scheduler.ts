import type { JobSchedule } from '@stitch/scheduler';
import type { Automation, AutomationSchedule } from '@stitch/shared/automations/types';

import { listAutomations, runAutomation } from './service.js';

import { registerSchedulerJob, unregisterSchedulerJob } from '@/scheduler/runtime.js';
import { getSettings } from '@/settings/service.js';

const AUTOMATION_JOB_KEY_PREFIX = 'automation:';
const DEFAULT_TIMEZONE = 'UTC';

function getAutomationJobKey(automationId: string): string {
  return `${AUTOMATION_JOB_KEY_PREFIX}${automationId}`;
}

function normalizeTimezone(timezone: string | null | undefined): string {
  const trimmed = timezone?.trim();
  if (!trimmed) return DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

async function resolveUserTimezone(): Promise<string> {
  const s = await getSettings(['profile.timezone'] as const);
  return normalizeTimezone(s['profile.timezone']);
}

function toSchedulerSchedule(schedule: AutomationSchedule, timezone: string): JobSchedule {
  return {
    type: 'cron',
    expression: schedule.expression,
    timezone,
  };
}

async function registerAutomationJob(automation: Automation, timezone: string): Promise<void> {
  if (!automation.schedule) return;

  await registerSchedulerJob({
    key: getAutomationJobKey(automation.id),
    schedule: toSchedulerSchedule(automation.schedule, timezone),
    callback: async () => {
      const result = await runAutomation(automation.id);
      if (result.error) {
        throw new Error(result.error.message);
      }
    },
    maxConcurrency: 1,
    catchup: 'one',
  });
}

export async function syncAutomationSchedule(automation: Automation): Promise<void> {
  const key = getAutomationJobKey(automation.id);

  if (!automation.schedule) {
    await unregisterSchedulerJob(key);
    return;
  }

  await registerAutomationJob(automation, await resolveUserTimezone());
}

export async function unregisterAutomationSchedule(automationId: string): Promise<void> {
  await unregisterSchedulerJob(getAutomationJobKey(automationId));
}

export async function syncAllAutomationSchedules(): Promise<void> {
  const pageSize = 100;
  const automationList: Automation[] = [];
  const timezone = await resolveUserTimezone();
  let page = 1;

  while (true) {
    const result = await listAutomations({ page, pageSize });
    if (result.error) throw new Error(result.error.message);

    automationList.push(...result.data.automations);

    if (result.data.totalPages === 0 || page >= result.data.totalPages) {
      break;
    }

    page += 1;
  }

  await Promise.all(
    automationList.map(async (automation) => {
      if (!automation.schedule) {
        await unregisterSchedulerJob(getAutomationJobKey(automation.id));
        return;
      }

      await registerAutomationJob(automation, timezone);
    }),
  );
}
