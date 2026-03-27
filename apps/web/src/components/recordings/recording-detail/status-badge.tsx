import type { MeetingStatus } from '@stitch/shared/meetings/types';

import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<MeetingStatus, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-success/10 text-success' },
  recording: { label: 'Recording', className: 'bg-destructive/10 text-destructive' },
  detected: { label: 'Detected', className: 'bg-primary/10 text-primary' },
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', style.className)}>
      {style.label}
    </span>
  );
}
