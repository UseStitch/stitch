export function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatDate(value: number | string): string {
  return new Date(value).toLocaleDateString();
}

/** Clamps at zero so clock skew between a remote server and the client cannot render a negative age. */
export function formatTimeAgo(value: Date, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - value.getTime()) / 1_000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
