import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, type ProviderId } from '@stitch/shared/providers/types';

import { ProviderConfig } from '@/components/settings/providers/provider-config';
import { ProviderRow } from '@/components/settings/providers/provider-row';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection } from '@/components/settings/settings-ui';
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
        <SettingSection title="Connected providers" className="mt-0">
          <div className="flex flex-col">
            {connected.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                onSelect={() => onSelect(provider)}
              />
            ))}
          </div>
        </SettingSection>
      )}

      {unconnected.length > 0 && (
        <SettingSection
          title="Popular providers"
          className={connected.length > 0 ? 'mt-6' : 'mt-0'}
        >
          <div className="flex flex-col">
            {unconnected.map((provider) => (
              <ProviderRow
                key={provider.id}
                provider={provider}
                onSelect={() => onSelect(provider)}
              />
            ))}
          </div>
        </SettingSection>
      )}
    </div>
  );
}

export function ProvidersSettings() {
  const page = SETTINGS_PAGE_BY_ID.providers;
  const Icon = page.icon;
  const [selected, setSelected] = React.useState<ProviderSummary | null>(null);

  return (
    <div className="flex h-full flex-col">
      {!selected && (
        <SettingPage
          title={page.title}
          description={page.description}
          icon={<Icon className="size-5" />}
        >
          <ProviderList onSelect={setSelected} />
        </SettingPage>
      )}
      {selected ? <ProviderConfig provider={selected} onBack={() => setSelected(null)} /> : null}
    </div>
  );
}
