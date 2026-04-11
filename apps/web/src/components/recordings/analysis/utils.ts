
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