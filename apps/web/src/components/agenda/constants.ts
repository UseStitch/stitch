import type { AgendaItemPriority, AgendaItemStatus } from '@stitch/shared/agenda/types';

export const STATUS_LABELS: Record<AgendaItemStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const STATUS_VARIANTS: Record<
  AgendaItemStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  open: 'default',
  in_progress: 'secondary',
  done: 'outline',
  cancelled: 'destructive',
};

export const PRIORITY_LABELS: Record<AgendaItemPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const PRIORITY_VARIANTS: Record<
  AgendaItemPriority,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  low: 'outline',
  medium: 'secondary',
  high: 'default',
  urgent: 'destructive',
};
