import * as React from 'react';
import { Loader2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RetryInfo } from '@/hooks/use-chat-stream';

export function RetryIndicator({ retry }: { retry: RetryInfo }) {
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

  const truncatedMessage = retry.message.length > 80;
  const displayMessage = truncatedMessage ? retry.message.slice(0, 80) + '...' : retry.message;

  const retryText = secondsRemaining > 0
    ? `Retrying in ${secondsRemaining}s - attempt ${retry.attempt}/${retry.maxRetries}`
    : `Retrying... (attempt ${retry.attempt}/${retry.maxRetries})`;

  return (
    <div
      className={cn(
        'my-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3',
      )}
    >
      <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-destructive" />
      <div className="min-w-0">
        {truncatedMessage ? (
          <div
            className="cursor-help truncate text-sm text-destructive"
            title={retry.message}
          >
            {displayMessage}
          </div>
        ) : (
          <div className="text-sm text-destructive">{displayMessage}</div>
        )}
        <div className="mt-1 text-xs text-destructive/70">{retryText}</div>
      </div>
    </div>
  );
}
