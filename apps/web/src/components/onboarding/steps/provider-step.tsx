import { PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, type ProviderId } from '@stitch/shared/providers/types';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { ProviderConfig } from '@/components/settings/providers/provider-config';
import { ProviderLogo } from '@/components/settings/providers/provider-logo';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { providersQueryOptions, type ProviderSummary } from '@/lib/queries/providers';

type Props = { onConnected: () => void };

type ProviderRowProps = { provider: ProviderSummary; onSelect: (provider: ProviderSummary) => void };

function ProviderRow({ provider, onSelect }: ProviderRowProps) {
  const meta = PROVIDER_META[provider.id as ProviderId];
  return (
    <div className="flex items-center justify-between border-b border-border-subtle px-space-xs py-space-l last:border-0">
      <div className="flex min-w-0 items-center gap-space-l">
        <Text as="div" variant="body" tone="muted">
          <ProviderLogo providerId={provider.id} providerName={meta.displayName} />
        </Text>
        <div className="min-w-0">
          <Text variant="body-strong" truncate>
            {meta.displayName}
          </Text>
          {meta.description && (
            <Text variant="caption" tone="muted" truncate>
              {meta.description}
            </Text>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => onSelect(provider)}>
        <span className="mr-space-xs">
          <Icon as={PlusIcon} size="s" />
        </span>
        Connect
      </Button>
    </div>
  );
}

export function ProviderStep({ onConnected }: Props) {
  const { data: providers } = useQuery({ ...providersQueryOptions, select: (data) => data });
  const [selected, setSelected] = React.useState<ProviderSummary | null>(null);
  const [search, setSearch] = React.useState('');

  const selectableProviders = (() => {
    if (!providers) return [];
    return providers.filter((provider) => {
      if (provider.enabled) return false;
      if (!(PROVIDER_IDS as readonly string[]).includes(provider.id)) return false;
      const meta = PROVIDER_META[provider.id as ProviderId];
      return meta.authMethods.some((method) => method.enabled);
    });
  })();

  const filteredProviders = (() => {
    if (!search) return selectableProviders;
    const q = search.toLowerCase();
    return selectableProviders.filter((provider) => {
      const meta = PROVIDER_META[provider.id as ProviderId];
      return meta.displayName.toLowerCase().includes(q) || meta.description?.toLowerCase().includes(q);
    });
  })();

  const handleBack = () => setSelected(null);

  if (!providers) {
    return (
      <Text as="div" variant="body" tone="muted">
        Loading providers...
      </Text>
    );
  }

  if (selected) {
    return (
      <ProviderConfig
        provider={selected}
        onBack={handleBack}
        saveLabel="Save and continue"
        onSaved={onConnected}
        showDisconnect={false}
      />
    );
  }

  return (
    <Stack gap="2xl">
      <div>
        <Text variant="heading-s">Setup Provider</Text>
        <div className="mt-space-xs">
          <Text variant="body" tone="muted">
            Connect one provider to unlock models and start chatting.
          </Text>
        </div>
      </div>

      <Stack gap="m">
        <SearchInput placeholder="Search providers..." value={search} onChange={(e) => setSearch(e.target.value)} />

        <div className="thin-scrollbar flex max-h-96 flex-col overflow-y-auto">
          {filteredProviders.length === 0 ? (
            <div className="px-space-xs py-space-l">
              <Text variant="body" tone="muted">
                {search ? 'No providers match your search.' : 'All available providers are already connected.'}
              </Text>
            </div>
          ) : (
            filteredProviders.map((provider) => (
              <ProviderRow key={provider.id} provider={provider} onSelect={setSelected} />
            ))
          )}
        </div>
      </Stack>
    </Stack>
  );
}
