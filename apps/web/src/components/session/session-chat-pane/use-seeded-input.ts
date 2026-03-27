import * as React from 'react';

import {
  consumeNextSessionInputSeed,
  getTransitionSeedClearDelayMs,
} from '@/lib/chat-input-transition-seed';

export function useSeededInput() {
  const seedTextRef = React.useRef(consumeNextSessionInputSeed());
  const [value, setValue] = React.useState(seedTextRef.current);

  React.useEffect(() => {
    const seedText = seedTextRef.current;
    if (!seedText) return;

    const timeoutId = window.setTimeout(() => {
      setValue((current) => (current === seedText ? '' : current));
    }, getTransitionSeedClearDelayMs());

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return {
    value,
    setValue,
  };
}
