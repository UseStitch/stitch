import { PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, type ProviderId } from '@stitch/shared/providers/types';

import { ProviderLogo } from '@/components/settings/provider-logo';
import { Button } from '@/components/ui/button';
import { serverFetch } from '@/lib/api';
import { type ProviderSummary, providerKeys } from '@/lib/queries/providers';

type Props = {
  provider: ProviderSummary;
  onSelect: () => void;
};

export function ProviderRow({ provider, onSelect }: Props) {
  const meta = (PROVIDER_IDS as readonly string[]).includes(provider.id)
    ? PROVIDER_META[provider.id as ProviderId]
    : undefined;
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await serverFetch(`/provider/${provider.id}/config`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: providerKeys.all });
    },
  });

  if (!meta) return null;

  const enabledAuthMethods = meta.authMethods.filter((method) => method.enabled);
  if (enabledAuthMethods.length === 0) return null;

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteMutation.mutate();
  };

  // Determine badge text. The image shows "Custom" for Bedrock and "API key" for Google.
  let badgeText = '';
  if (provider.enabled && enabledAuthMethods.length > 0) {
    if (provider.id === 'amazon-bedrock')
      badgeText = 'Custom'; // matching screenshot specifically
    else badgeText = enabledAuthMethods[0]?.label || '';
  }

  return (
    <div className="group -mx-2 flex items-center justify-between border-b border-border/50 px-2 py-3 last:border-0">
      <div className="flex min-w-0 items-center gap-4">
        <div className="shrink-0 text-muted-foreground">
          <ProviderLogo providerId={provider.id} providerName={meta.displayName} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground">{meta.displayName}</span>
            {provider.enabled && badgeText && (
              <span className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.75 text-[10px] leading-none font-medium text-muted-foreground">
                {badgeText}
              </span>
            )}
          </div>
          {!provider.enabled && meta.description && (
            <span className="truncate text-[12px] text-muted-foreground">{meta.description}</span>
          )}
        </div>
      </div>
      <div className="ml-4 flex shrink-0 items-center">
        {provider.enabled ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-[13px] font-semibold text-foreground opacity-90 transition-colors hover:bg-transparent hover:text-destructive hover:opacity-100"
            onClick={handleDisconnect}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
          </Button>
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
