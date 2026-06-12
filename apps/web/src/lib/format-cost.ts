export function formatUsdCost(costUsd: number): string {
  if (costUsd === 0) {
    return '$0.00';
  }

  if (Math.abs(costUsd) < 0.01) {
    return `$${costUsd.toFixed(4).replace(/0+$/, '')}`;
  }

  return `$${costUsd.toFixed(2)}`;
}
