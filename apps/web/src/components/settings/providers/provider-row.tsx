import { PlusIcon, Settings2Icon } from 'lucide-react';
import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, type ProviderId } from '@stitch/shared/providers/types';

import { ProviderLogo } from '@/components/settings/providers/provider-logo';
import { SettingsIconButtonTooltip } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { useDeleteProviderConfigMutation } from '@/lib/mutations/provider-config';
import { type ProviderSummary } from '@/lib/queries/providers';

type Props = {
  provider: ProviderSummary;
  onSelect: () => void;
};

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
    <div className="group -mx-2 flex items-center justify-between border-b border-border/50 px-2 py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-4">
        <div className="shrink-0 text-muted-foreground">
          <ProviderLogo providerId={provider.id} providerName={meta.displayName} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-semibold text-foreground">{meta.displayName}</span>
          {!provider.enabled && meta.description && (
            <span className="truncate text-[12px] text-muted-foreground">{meta.description}</span>
          )}
        </div>
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-1.5">
        {provider.enabled ? (
          <>
            {provider.id === 'ollama_local' && (
              <SettingsIconButtonTooltip label="Manage models">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Manage models"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                  }}
                >
                  <Settings2Icon className="size-3.5" />
                </Button>
              </SettingsIconButtonTooltip>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-3 text-[13px] font-semibold"
              onClick={handleDisconnect}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-[6px] border-border/60 bg-transparent px-2.5 text-[12px] font-semibold text-foreground/90 transition-colors hover:bg-muted/50"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <PlusIcon className="mr-0.75 size-3.5 text-muted-foreground" />
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
