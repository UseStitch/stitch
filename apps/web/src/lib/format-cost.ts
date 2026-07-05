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
