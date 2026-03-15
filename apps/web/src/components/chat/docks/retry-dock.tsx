import { Loader2Icon } from 'lucide-react';
import * as React from 'react';

import type { RetryInfo } from '@/hooks/sse/use-chat-stream';

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
    <div className="flex items-start gap-3">
      <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-destructive" />
      <div className="min-w-0">
        <div className="text-sm text-destructive line-clamp-2" title={retry.message}>
          {retry.message}
        </div>
        <div className="mt-1 text-xs text-destructive/70">{retryText}</div>
      </div>
    </div>
  );
}
