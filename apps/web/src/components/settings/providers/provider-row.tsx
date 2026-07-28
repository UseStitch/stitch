import { PlusIcon, Settings2Icon } from 'lucide-react';
import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, isLocalProviderId, type ProviderId } from '@stitch/shared/providers/types';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { ProviderLogo } from '@/components/settings/providers/provider-logo';
import { SettingsIconButtonTooltip } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { useDeleteProviderConfigMutation } from '@/lib/mutations/provider-config';
import { type ProviderSummary } from '@/lib/queries/providers';

type Props = { provider: ProviderSummary; onSelect: () => void };

export function ProviderRow({ provider, onSelect }: Props) {
  const meta = (PROVIDER_IDS as readonly string[]).includes(provider.id)
    ? PROVIDER_META[provider.id as ProviderId]
    : undefined;
  const queryClient = useQueryClient();

  const deleteMutation = useDeleteProviderConfigMutation({
    providerId: provider.id,
    queryClient,
    successMessage: `${meta?.displayName ?? 'Provider'} disconnected`,
    errorMessage: 'Failed to disconnect',
  });

  if (!meta) return null;

  const enabledAuthMethods = meta.authMethods.filter((method) => method.enabled);
  if (enabledAuthMethods.length === 0) return null;

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMutation.mutate();
  };

  return (
    <div className="group -mx-space-m flex items-center justify-between border-b border-border-subtle px-space-m py-space-l last:border-0">
      <div className="flex min-w-0 items-center gap-space-xl">
        <div className="shrink-0 text-muted-foreground">
          <ProviderLogo providerId={provider.id} providerName={meta.displayName} />
        </div>
        <div className="flex min-w-0 flex-col gap-space-xs">
          <Text as="span" variant="body-strong">
            {meta.displayName}
          </Text>
          {!provider.enabled && meta.description && (
            <Text variant="caption" tone="muted" truncate>
              {meta.description}
            </Text>
          )}
        </div>
      </div>
      <div className="ml-space-xl flex shrink-0 items-center gap-space-s">
        {provider.enabled ? (
          <>
            {isLocalProviderId(provider.id) && (
              <SettingsIconButtonTooltip label="Manage models">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Manage models"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                  }}>
                  <Icon as={Settings2Icon} size="s" />
                </Button>
              </SettingsIconButtonTooltip>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="px-space-l text-sm font-semibold"
              onClick={handleDisconnect}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-md border-border-subtle bg-transparent text-xs font-semibold text-foreground transition-colors hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}>
            <div className="mr-space-2xs text-muted-foreground">
              <Icon as={PlusIcon} size="s" />
            </div>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
