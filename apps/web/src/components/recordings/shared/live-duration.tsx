import * as React from 'react';

import { formatClockDuration } from './formatting';

function useDurationTick(): number {
  const [tick, setTick] = React.useState(Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  return tick;
}

export function LiveDuration({ startedAt }: { startedAt: number }) {
  const tick = useDurationTick();

  return <span className="text-xs text-muted-foreground">{formatClockDuration(tick - startedAt)}</span>;
}

export function LiveDurationText({ startedAt }: { startedAt: number }) {
  const tick = useDurationTick();

  return <>{formatClockDuration(tick - startedAt)}</>;
}
