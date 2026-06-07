import { PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, type ProviderId } from '@stitch/shared/providers/types';

import { ProviderConfig } from '@/components/settings/providers/provider-config';
import { ProviderLogo } from '@/components/settings/providers/provider-logo';
import { Button } from '@/components/ui/button';
import { providersQueryOptions, type ProviderSummary } from '@/lib/queries/providers';

type Props = {
  onConnected: () => void;
};

export function ProviderStep({ onConnected }: Props) {
  const { data: providers } = useQuery(providersQueryOptions);
  const [selected, setSelected] = React.useState<ProviderSummary | null>(null);

  const selectableProviders = React.useMemo(() => {
    if (!providers) return [];
    return providers.filter((provider) => {
      if (provider.enabled) return false;
      if (!(PROVIDER_IDS as readonly string[]).includes(provider.id)) return false;
      const meta = PROVIDER_META[provider.id as ProviderId];
      return meta.authMethods.some((method) => method.enabled);
    });
  }, [providers]);

  if (!providers) {
    return <div className="text-sm text-muted-foreground">Loading providers...</div>;
  }

  if (selected) {
    return (
      <ProviderConfig
        provider={selected}
        onBack={() => setSelected(null)}
        saveLabel="Save and continue"
        onSaved={onConnected}
        showDisconnect={false}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Setup Provider</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect one provider to unlock models and start chatting.
        </p>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border/60">
        {selectableProviders.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            All available providers are already connected.
          </div>
        ) : (
          selectableProviders.map((provider) => {
            const meta = PROVIDER_META[provider.id as ProviderId];
            return (
              <div
                key={provider.id}
                className="flex items-center justify-between border-b border-border/50 px-4 py-3 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="shrink-0 text-muted-foreground">
                    <ProviderLogo providerId={provider.id} providerName={meta.displayName} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{meta.displayName}</p>
                    {meta.description && (
                      <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelected(provider)}>
                  <PlusIcon className="mr-1 size-3.5" />
                  Connect
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
