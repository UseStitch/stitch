import * as React from 'react';

import type { PermissionResponse } from '@stitch/shared/permissions/types';

import { Dock } from '@/components/chat/docks/dock';
import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
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

  const canSubmitAlternative = entry.trim().length > 0 && !isPending;
  const isDirectorySuggestion = suggestion?.message.startsWith(DIR_PREFIX) ?? false;
  const dir = isDirectorySuggestion ? suggestion?.message.slice(DIR_PREFIX.length) : null;

  return (
    <Dock.Root>
      <Dock.Title>
        <Text as="span" variant="body-strong">
          Tool:
        </Text>{' '}
        {toolLabel}
      </Dock.Title>
      <Dock.Description flush>{permissionResponse.systemReminder}</Dock.Description>

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
        <Button
          type="button"
          variant="quiet"
          size="inline"
          disabled={isPending}
          onClick={() => void onApplySuggestion(permissionResponse.id, suggestion.pattern)}
          className="group items-baseline gap-space-s">
          <span className="underline-offset-2 group-hover:underline">
            <Text as="span" variant="caption" tone="muted">
              Always allow in directory
            </Text>
          </span>
          <span className="max-w-70 opacity-60 group-hover:opacity-100">
            <Text as="span" variant="code" tone="muted" truncate>
              {dir}
            </Text>
          </span>
        </Button>
      ) : null}

      <Stack direction="row" align="center" gap="m">
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
      </Stack>
    </Dock.Root>
  );
}
