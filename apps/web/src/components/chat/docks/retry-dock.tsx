import { Loader2Icon } from 'lucide-react';
import * as React from 'react';

import { Dock } from '@/components/chat/docks/dock';
import type { RetryInfo } from '@/stores/stream-store';

export function RetryDock({ retry }: { retry: RetryInfo }) {
  const [secondsRemaining, setSecondsRemaining] = React.useState(0);

  React.useEffect(() => {
    const update = () => {
      const remaining = Math.max(0, Math.round((retry.nextRetryAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [retry.nextRetryAt]);

  const retryText =
    secondsRemaining > 0
      ? `Retrying in ${secondsRemaining}s - attempt ${retry.attempt}/${retry.maxRetries}`
      : `Retrying... (attempt ${retry.attempt}/${retry.maxRetries})`;

  return (
    <Dock.Inline>
      <Dock.Icon>
        <Loader2Icon className="size-4 animate-spin text-destructive" />
      </Dock.Icon>
      <Dock.Body>
        <Dock.Title className="line-clamp-2 text-destructive" title={retry.message}>
          {retry.message}
        </Dock.Title>
        <Dock.Description className="text-destructive/70">{retryText}</Dock.Description>
      </Dock.Body>
    </Dock.Inline>
  );
}
