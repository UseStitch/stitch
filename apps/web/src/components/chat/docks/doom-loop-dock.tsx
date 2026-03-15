import * as React from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { serverFetch } from '@/lib/api';

type DoomLoopDockProps = {
  sessionId: string;
  toolName: string;
};

export function DoomLoopDock({ sessionId, toolName }: DoomLoopDockProps) {
  const [responding, setResponding] = React.useState(false);

  async function handleResponse(response: 'continue' | 'stop') {
    setResponding(true);
    await serverFetch(`/sessions/${sessionId}/doom-loop-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    });
  }

  return (
    <div className="flex items-center gap-3">
      <RefreshCwIcon className="size-4 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground">
          Repeating <code className="rounded bg-muted px-1 py-0.5 text-xs">{toolName}</code> with
          identical input
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          The assistant may be stuck in a loop
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void handleResponse('stop')}
          disabled={responding}
        >
          Stop
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleResponse('continue')}
          disabled={responding}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
