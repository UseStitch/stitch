export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Not started';
  if (status === 'pending') return 'Pending';
  if (status === 'processing') return 'Processing';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  return status;
}

export function statusClassName(status: string | null | undefined): string {
  if (status === 'completed') return 'bg-success/15 text-success';
  if (status === 'failed') return 'bg-destructive/15 text-destructive';
  if (status === 'processing' || status === 'pending') return 'bg-warning/15 text-warning';
  return 'bg-muted text-muted-foreground';
}

export function actionStatusLabel(status: string): string {
  if (status === 'in_progress') return 'In progress';
  if (status === 'done') return 'Done';
  if (status === 'todo') return 'To do';
  return 'Unknown';
}

export function actionStatusColor(status: string): string {
  if (status === 'in_progress') return 'text-primary';
  if (status === 'done') return 'text-success';
  return 'text-muted-foreground';
}