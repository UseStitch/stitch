const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(value: number): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
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

export function formatUsdCost(costUsd: number): string {
  if (costUsd === 0) {
    return '$0';
  }

  if (Math.abs(costUsd) < 0.01) {
    const precision = Math.min(Math.ceil(-Math.log10(Math.abs(costUsd))) + 1, 8);
    return `$${costUsd.toFixed(precision).replace(/0+$/, '')}`;
  }

  return `$${costUsd.toFixed(2)}`;
}
