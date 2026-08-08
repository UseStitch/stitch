import type { PrefixedString } from '../id/index.js';

export type BackgroundTaskStatus = 'running' | 'completed' | 'error' | 'cancelled' | 'interrupted';

export type BackgroundTaskDeliveryStatus = 'pending' | 'claimed' | 'delivered' | 'not-applicable';

export type BackgroundTask = {
  id: PrefixedString<'ses'>;
  parentSessionId: PrefixedString<'ses'>;
  childSessionId: PrefixedString<'ses'>;
  originMessageId: PrefixedString<'msg'>;
  originToolCallId: string;
  title: string;
  status: BackgroundTaskStatus;
  deliveryStatus: BackgroundTaskDeliveryStatus;
  result: string | null;
  error: string | null;
  providerId: string;
  modelId: string;
  activeToolsetIds: string[];
  startedAt: number;
  completedAt: number | null;
  deliveredAt: number | null;
};
