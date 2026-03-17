import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';
import { PROVIDER_META, PROVIDER_IDS, type ProviderId } from '@openwork/shared';

import { ProviderConfig } from '@/components/settings/provider-config';
import { ProviderRow } from '@/components/settings/provider-row';
import { providersQueryOptions, type ProviderSummary } from '@/lib/queries/providers';

function ProviderList({ onSelect }: { onSelect: (provider: ProviderSummary) => void }) {
  const { data: providers } = useSuspenseQuery(providersQueryOptions);

  const providersWithEnabledAuth = providers.filter((provider) => {
    if (!(PROVIDER_IDS as readonly string[]).includes(provider.id)) return false;
    const meta = PROVIDER_META[provider.id as ProviderId];
    return meta.authMethods.some((method) => method.enabled);
  });

  const connected = providersWithEnabledAuth.filter((p) => p.enabled);
  const unconnected = providersWithEnabledAuth.filter((p) => !p.enabled);

  return (
    <div className="flex flex-col gap-6">
      {connected.length > 0 && (
        <div className="flex flex-col">
          <h3 className="text-[13px] font-semibold mb-2">Connected providers</h3>
          <div className="flex flex-col">
            {connected.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                onSelect={() => onSelect(provider)}
              />
            ))}
          </div>
        </div>
      )}

      {unconnected.length > 0 && (
        <div className="flex flex-col">
          <h3 className="text-[13px] font-semibold mb-2">Popular providers</h3>
          <div className="flex flex-col">
            {unconnected.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                onSelect={() => onSelect(provider)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProvidersSettings() {
  const [selected, setSelected] = React.useState<ProviderSummary | null>(null);

  return (
    <div className="flex flex-col h-full">
      {!selected && (
        <div className="mb-6">
          <h2 className="text-base font-bold">Providers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your AI providers and API keys
          </p>
        </div>
      )}
      <React.Suspense
        fallback={<div className="text-muted-foreground text-sm">Loading providers...</div>}
      >
        {selected ? (
          <ProviderConfig provider={selected} onBack={() => setSelected(null)} />
        ) : (
          <ProviderList onSelect={setSelected} />
        )}
      </React.Suspense>
    </div>
  );
}
