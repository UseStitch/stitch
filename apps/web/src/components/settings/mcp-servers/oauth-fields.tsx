import * as React from 'react';

import type { AddFormState } from './shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type OAuthFieldKey = 'oauthScopes' | 'oauthClientId' | 'oauthClientSecret';

export function OAuthFields({
  form,
  set,
  expanded = false,
}: {
  form: Pick<AddFormState, OAuthFieldKey>;
  set: (key: OAuthFieldKey, value: string) => void;
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
        <div className="space-y-3 rounded-md border border-border-subtle p-3">
          <p className="text-xs text-muted-foreground">
            Provide a pre-registered client only if the server does not support dynamic client registration.
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
        <Button
          type="button"
          variant="ghost"
          className="h-auto p-0 text-xs font-normal text-muted-foreground underline hover:bg-transparent hover:text-foreground"
          onClick={() => setShowAdvanced(true)}>
          Advanced: provide a pre-registered client
        </Button>
      )}
    </div>
  );
}
