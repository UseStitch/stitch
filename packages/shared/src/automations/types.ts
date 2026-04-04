import type { PrefixedString } from '@stitch/shared/id';

export type Automation = {
  id: PrefixedString<'auto'>;
  providerId: string;
  modelId: string;
  initialMessage: string;
  title: string;
  schedule: AutomationSchedule | null;
  runCount: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationIntervalSchedule = {
  type: 'interval';
  everyMinutes: number;
};

export type AutomationCronSchedule = {
  type: 'cron';
  expression: string;
};

export type AutomationSchedule = AutomationIntervalSchedule | AutomationCronSchedule;

export type AutomationScheduleBlobV1 = {
  version: 1;
  schedule: AutomationSchedule;
};

export type AutomationScheduleBlob = AutomationScheduleBlobV1;

export type CreateAutomationInput = {
  providerId: string;
  modelId: string;
  initialMessage: string;
  title: string;
  schedule: AutomationSchedule | null;
};

export type UpdateAutomationInput = Partial<CreateAutomationInput>;

export type RunAutomationResponse = {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  userMessageId: PrefixedString<'msg'>;
};
