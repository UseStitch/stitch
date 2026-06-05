import { ServerIcon } from 'lucide-react';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, type ProviderId } from '@stitch/shared/providers/types';

import { ProviderConfig } from '@/components/settings/providers/provider-config';
import { ProviderRow } from '@/components/settings/providers/provider-row';
import { SettingPage } from '@/components/settings/settings-ui';
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
          <h3 className="mb-2 text-[13px] font-semibold">Connected providers</h3>
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
          <h3 className="mb-2 text-[13px] font-semibold">Popular providers</h3>
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
    <div className="flex h-full flex-col">
      {!selected && (
        <SettingPage
          title="Providers"
          description="Connect your AI providers and API keys"
          icon={<ServerIcon className="size-5" />}
        >
          <ProviderList onSelect={setSelected} />
        </SettingPage>
      )}
      {selected ? <ProviderConfig provider={selected} onBack={() => setSelected(null)} /> : null}
    </div>
  );
}
