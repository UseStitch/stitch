import type { PrefixedString } from '@stitch/shared/id';

export type Automation = {
  id: PrefixedString<'auto'>;
  providerId: string;
  modelId: string;
  initialMessage: string;
  title: string;
  runCount: number;
  createdAt: number;
  updatedAt: number;
};

export type CreateAutomationInput = {
  providerId: string;
  modelId: string;
  initialMessage: string;
  title: string;
};

export type UpdateAutomationInput = Partial<CreateAutomationInput>;

export type RunAutomationResponse = {
  sessionId: PrefixedString<'ses'>;
  assistantMessageId: PrefixedString<'msg'>;
  userMessageId: PrefixedString<'msg'>;
};
