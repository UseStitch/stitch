import { RefreshCwIcon } from 'lucide-react';

import { Dock } from '@/components/chat/docks/dock';
import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';
import { useRespondDoomLoop } from '@/lib/queries/chat';

type DoomLoopDockProps = { sessionId: string; toolName: string };

export function DoomLoopDock({ sessionId, toolName }: DoomLoopDockProps) {
  const respondDoomLoop = useRespondDoomLoop();

  return (
    <Dock.Inline className="items-center gap-space-xl">
      <Dock.Icon className="mt-space-none">
        <Icon as={RefreshCwIcon} size="m" color="var(--warning)" />
      </Dock.Icon>
      <Dock.Body>
        <Dock.Title>
          Repeating{' '}
          <span className="rounded-sm bg-muted px-space-xs py-space-2xs">
            <Text as="code" variant="code">
              {toolName}
            </Text>
          </span>{' '}
          with identical input
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
