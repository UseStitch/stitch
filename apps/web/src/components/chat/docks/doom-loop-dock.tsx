import { RefreshCwIcon } from 'lucide-react';

import { Dock } from '@/components/chat/docks/dock';
import { Button } from '@/components/ui/button';
import { useRespondDoomLoop } from '@/lib/queries/chat';

type DoomLoopDockProps = { sessionId: string; toolName: string };

export function DoomLoopDock({ sessionId, toolName }: DoomLoopDockProps) {
  const respondDoomLoop = useRespondDoomLoop();

  return (
    <Dock.Inline className="items-center gap-4">
      <Dock.Icon className="mt-0">
        <RefreshCwIcon className="size-4 text-warning" />
      </Dock.Icon>
      <Dock.Body>
        <Dock.Title>
          Repeating <code className="rounded bg-muted px-1 py-0.5 text-xs">{toolName}</code> with identical input
        </Dock.Title>
        <Dock.Description>The assistant may be stuck in a loop</Dock.Description>
      </Dock.Body>
      <Dock.Actions className="shrink-0 flex-nowrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => respondDoomLoop.mutate({ sessionId, response: 'stop' })}
          disabled={respondDoomLoop.isPending}>
          Stop
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() => respondDoomLoop.mutate({ sessionId, response: 'continue' })}
          disabled={respondDoomLoop.isPending}>
          Continue
        </Button>
      </Dock.Actions>
    </Dock.Inline>
  );
}
