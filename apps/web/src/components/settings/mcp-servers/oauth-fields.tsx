import * as React from 'react';

import type { AddFormState } from './shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function OAuthFields({
  form,
  set,
  expanded = false,
}: {
  form: AddFormState;
  set: <K extends keyof AddFormState>(key: K, value: AddFormState[K]) => void;
  expanded?: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = React.useState(
    expanded || Boolean(form.oauthClientId || form.oauthClientSecret),
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Scopes (optional)</Label>
        <Input
          value={form.oauthScopes}
          onChange={(e) => set('oauthScopes', e.target.value)}
          placeholder="space or comma separated"
        />
      </div>

      {showAdvanced ? (
        <div className="space-y-3 rounded-md border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">
            Provide a pre-registered client only if the server does not support dynamic client
            registration.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Client ID</Label>
            <Input
              value={form.oauthClientId}
              onChange={(e) => set('oauthClientId', e.target.value)}
              placeholder="optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Client Secret</Label>
            <Input
              value={form.oauthClientSecret}
              onChange={(e) => set('oauthClientSecret', e.target.value)}
              placeholder="optional"
              type="password"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="text-xs text-muted-foreground underline hover:text-foreground"
          onClick={() => setShowAdvanced(true)}
        >
          Advanced: provide a pre-registered client
        </button>
      )}
    </div>
  );
}
