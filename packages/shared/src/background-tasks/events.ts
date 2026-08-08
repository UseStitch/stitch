import type { BackgroundTask } from './types.js';

export const BACKGROUND_TASK_EVENT_NAMES = [
  'background-task.started',
  'background-task.completed',
  'background-task.failed',
  'background-task.cancelled',
  'background-task.interrupted',
] as const;

type BackgroundTaskEventPayload = { task: BackgroundTask };

export type BackgroundTaskEvents = {
  'background-task.started': BackgroundTaskEventPayload;
  'background-task.completed': BackgroundTaskEventPayload;
  'background-task.failed': BackgroundTaskEventPayload;
  'background-task.cancelled': BackgroundTaskEventPayload;
  'background-task.interrupted': BackgroundTaskEventPayload;
};
