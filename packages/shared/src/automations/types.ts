import type { PrefixedString } from '@stitch/shared/id';
import type { PaginationMetadata, SortDirection } from '@stitch/shared/pagination';

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

export type AutomationSchedule = { type: 'cron'; expression: string };

export type AutomationScheduleBlob = { version: 1; schedule: AutomationSchedule };

export type CreateAutomationInput = {
  providerId: string;
  modelId: string;
  initialMessage: string;
  title: string;
  schedule: AutomationSchedule | null;
};

export type UpdateAutomationInput = Partial<CreateAutomationInput>;

export type DeleteAutomationInput = { archiveSessions: boolean };

export type RunAutomationResponse = {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  userMessageId: PrefixedString<'msg'>;
};

export type GeneratedAutomationDraft = {
  title: string;
  toolsets: string[];
  steps: string[];
  prompt: string;
  providerId: string;
  modelId: string;
};

export type ListAutomationsResponse = PaginationMetadata & { automations: Automation[] };

export type AutomationSortField = 'title' | 'runCount' | 'createdAt' | 'updatedAt';

export type ListAutomationsInput = {
  page: number;
  pageSize: number;
  sort: AutomationSortField;
  sortDirection: SortDirection;
};
