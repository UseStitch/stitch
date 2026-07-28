import * as React from 'react';

import type { AddFormState } from './shared';
import { Text } from '@/components/primitives/text';
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
    <div className="space-y-space-l">
      <div className="space-y-space-s">
        <Label className="text-xs font-medium text-muted-foreground">Scopes (optional)</Label>
        <Input
          value={form.oauthScopes}
          onChange={(e) => set('oauthScopes', e.target.value)}
          placeholder="space or comma separated"
        />
      </div>

      {showAdvanced ? (
        <div className="space-y-space-l rounded-md border border-border-subtle p-space-l">
          <Text variant="caption" tone="muted">
            Provide a pre-registered client only if the server does not support dynamic client registration.
          </Text>
          <div className="space-y-space-s">
            <Label className="text-xs font-medium text-muted-foreground">Client ID</Label>
            <Input
              value={form.oauthClientId}
              onChange={(e) => set('oauthClientId', e.target.value)}
              placeholder="optional"
            />
          </div>
          <div className="space-y-space-s">
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
        <Button type="button" variant="quiet" size="inline" onClick={() => setShowAdvanced(true)}>
          <u>
            <Text as="span" variant="caption" tone="muted">
              Advanced: provide a pre-registered client
            </Text>
          </u>
        </Button>
      )}
    </div>
  );
}
