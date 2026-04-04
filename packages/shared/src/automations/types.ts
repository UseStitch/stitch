import type { PrefixedString } from '@stitch/shared/id';

export type Automation = {
  id: PrefixedString<'auto'>;
  providerId: string;
  modelId: string;
  initialMessage: string;
  title: string;
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
