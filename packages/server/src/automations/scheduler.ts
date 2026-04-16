import type { JobSchedule } from '@stitch/scheduler';
import type { Automation, AutomationSchedule } from '@stitch/shared/automations/types';

import { listAutomations, runAutomation } from './service.js';

import { registerSchedulerJob, unregisterSchedulerJob } from '@/scheduler/runtime.js';
import { isServiceError } from '@/lib/service-result.js';

const AUTOMATION_JOB_KEY_PREFIX = 'automation:';

function getAutomationJobKey(automationId: string): string {
  return `${AUTOMATION_JOB_KEY_PREFIX}${automationId}`;
}

function toSchedulerSchedule(schedule: AutomationSchedule): JobSchedule {
  return {
    type: 'cron',
    expression: schedule.expression,
    timezone: 'local',
  };
}

async function registerAutomationJob(automation: Automation): Promise<void> {
  if (!automation.schedule) return;

  await registerSchedulerJob({
    key: getAutomationJobKey(automation.id),
    schedule: toSchedulerSchedule(automation.schedule),
    callback: async () => {
      const result = await runAutomation(automation.id);
      if (isServiceError(result)) {
        throw new Error(result.error);
      }
    },
    maxConcurrency: 1,
    queueEnabled: true,
    catchup: 'one',
  });
}

export async function syncAutomationSchedule(automation: Automation): Promise<void> {
  const key = getAutomationJobKey(automation.id);
  await unregisterSchedulerJob(key);

  if (!automation.schedule) return;
  await registerAutomationJob(automation);
}

export async function unregisterAutomationSchedule(automationId: string): Promise<void> {
  await unregisterSchedulerJob(getAutomationJobKey(automationId));
}

export async function syncAllAutomationSchedules(): Promise<void> {
  const pageSize = 100;
  const automationList: Automation[] = [];
  let page = 1;

  while (true) {
    const result = await listAutomations({ page, pageSize });
    if (isServiceError(result)) break;

    automationList.push(...result.data.automations);

    if (result.data.totalPages === 0 || page >= result.data.totalPages) {
      break;
    }

    page += 1;
  }

  await Promise.all(automationList.map((automation) => syncAutomationSchedule(automation)));
}
