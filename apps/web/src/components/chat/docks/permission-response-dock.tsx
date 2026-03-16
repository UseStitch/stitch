import * as React from 'react';

import type { PermissionResponse } from '@openwork/shared';

import { Button } from '@/components/ui/button';

type PermissionResponseDockProps = {
  permissionResponses: PermissionResponse[];
  onAllow: (permissionResponseId: string) => Promise<void>;
  onReject: (permissionResponseId: string) => Promise<void>;
  onAlternative: (permissionResponseId: string, entry: string) => Promise<void>;
};

export function PermissionResponseDock({
  permissionResponses,
  onAllow,
  onReject,
  onAlternative,
}: PermissionResponseDockProps) {
  const pending = permissionResponses[0];
  const [entry, setEntry] = React.useState('');

  React.useEffect(() => {
    setEntry('');
  }, [pending?.id]);

  if (!pending) return null;

  const canSubmitAlternative = entry.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="text-foreground/90">
        <span className="font-medium">Tool:</span> {pending.toolName}
      </div>
      <div className="text-muted-foreground text-xs">{pending.systemReminder}</div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void onAllow(pending.id)}>
          Allow
        </Button>
        <Button size="sm" variant="destructive" onClick={() => void onReject(pending.id)}>
          Reject
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="Do something else..."
          className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!canSubmitAlternative}
          onClick={() => {
            const value = entry.trim();
            if (!value) return;
            void onAlternative(pending.id, value);
          }}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
