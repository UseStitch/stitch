import * as React from 'react';

import type { PermissionResponse } from '@stitch/shared/permissions/types';

import { Dock } from '@/components/chat/docks/dock';
import { Button } from '@/components/ui/button';

type PermissionResponseDockProps = {
  permissionResponse: PermissionResponse;
  toolLabel: string;
  isPending: boolean;
  onAllow: (permissionResponseId: string) => Promise<void>;
  onAlwaysAllow: (permissionResponseId: string) => Promise<void>;
  onReject: (permissionResponseId: string) => Promise<void>;
  onAlternative: (permissionResponseId: string, entry: string) => Promise<void>;
  onApplySuggestion: (permissionResponseId: string, pattern: string) => Promise<void>;
};

const DIR_PREFIX = 'Always allow in ';

export function PermissionResponseDock({
  permissionResponse,
  toolLabel,
  isPending,
  onAllow,
  onAlwaysAllow,
  onReject,
  onAlternative,
  onApplySuggestion,
}: PermissionResponseDockProps) {
  const suggestion = permissionResponse.suggestion;
  const [entry, setEntry] = React.useState('');

  React.useEffect(() => {
    setEntry('');
  }, [permissionResponse.id]);

  const canSubmitAlternative = entry.trim().length > 0 && !isPending;
  const isDirectorySuggestion = suggestion?.message.startsWith(DIR_PREFIX) ?? false;
  const dir = isDirectorySuggestion ? suggestion?.message.slice(DIR_PREFIX.length) : null;

  return (
    <Dock.Root>
      <Dock.Title className="text-foreground/90">
        <span className="font-medium">Tool:</span> {toolLabel}
      </Dock.Title>
      <Dock.Description className="mt-0">{permissionResponse.systemReminder}</Dock.Description>

      <Dock.Actions>
        <Button size="sm" disabled={isPending} onClick={() => void onAllow(permissionResponse.id)}>
          Allow
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => void onAlwaysAllow(permissionResponse.id)}>
          Always allow this tool
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          onClick={() => void onReject(permissionResponse.id)}>
          Reject
        </Button>
        {suggestion && !isDirectorySuggestion ? (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => void onApplySuggestion(permissionResponse.id, suggestion.pattern)}>
            {suggestion.message}
          </Button>
        ) : null}
      </Dock.Actions>

      {suggestion && isDirectorySuggestion ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => void onApplySuggestion(permissionResponse.id, suggestion.pattern)}
          className="group flex w-fit items-baseline gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
          <span className="underline-offset-2 group-hover:underline">Always allow in directory</span>
          <span className="max-w-70 truncate font-mono opacity-60 group-hover:opacity-100">{dir}</span>
        </button>
      ) : null}

      <div className="flex items-center gap-2">
        <Dock.Input
          type="text"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="Do something else..."
          disabled={isPending}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!canSubmitAlternative}
          onClick={() => {
            const value = entry.trim();
            if (!value) return;
            void onAlternative(permissionResponse.id, value);
          }}>
          Send
        </Button>
      </div>
    </Dock.Root>
  );
}
