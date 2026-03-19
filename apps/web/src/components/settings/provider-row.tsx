import { PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { PROVIDER_META } from '@openwork/shared/providers/catalog';
import { PROVIDER_IDS, type ProviderId } from '@openwork/shared/providers/types';

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
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0 px-2 -mx-2 group">
      <div className="flex items-center gap-4 min-w-0">
        <div className="text-muted-foreground shrink-0">
          <ProviderLogo providerId={provider.id} providerName={meta.displayName} />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground">{meta.displayName}</span>
            {provider.enabled && badgeText && (
              <span className="text-[10px] leading-none border border-border/60 px-1.5 py-0.75 rounded text-muted-foreground font-medium bg-muted/20">
                {badgeText}
              </span>
            )}
          </div>
          {!provider.enabled && meta.description && (
            <span className="text-muted-foreground text-[12px] truncate">{meta.description}</span>
          )}
        </div>
      </div>
      <div className="flex items-center shrink-0 ml-4">
        {provider.enabled ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-3 text-[13px] font-semibold text-foreground hover:bg-transparent hover:text-destructive transition-colors opacity-90 hover:opacity-100"
            onClick={handleDisconnect}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[12px] font-semibold rounded-[6px] bg-transparent border-border/60 hover:bg-muted/50 text-foreground/90 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <PlusIcon className="size-3.5 mr-0.75 text-muted-foreground" />
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
