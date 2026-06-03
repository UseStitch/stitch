import * as React from 'react';

import { formatClockDuration } from './formatting';

import { Table } from '@/components/ui/table';

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

  return <Table.Duration>{formatClockDuration(tick - startedAt)}</Table.Duration>;
}

export function LiveDurationText({ startedAt }: { startedAt: number }) {
  const tick = useDurationTick();

  return <>{formatClockDuration(tick - startedAt)}</>;
}
