import {
  Trash2Icon,
  RefreshCwIcon,
  ExternalLinkIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ClockIcon,
  Loader2Icon,
  ArrowUpCircleIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type {
  ConnectorDefinition,
  ConnectorInstanceSafe,
  ConnectorStatus,
} from '@stitch/shared/connectors/types';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useAuthorizeConnector,
  useDeleteConnector,
  useTestConnector,
  useUpgradeConnector,
} from '@/lib/queries/connectors';

type Props = {
  instances: ConnectorInstanceSafe[];
  definitions: ConnectorDefinition[];
};

const STATUS_CONFIG: Record<
  ConnectorStatus,
  { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  connected: {
    label: 'Connected',
    icon: <CheckCircle2Icon className="size-3" />,
    variant: 'default',
  },
  awaiting_auth: {
    label: 'Awaiting Auth',
    icon: <ClockIcon className="size-3" />,
    variant: 'outline',
  },
  pending_setup: {
    label: 'Pending Setup',
    icon: <ClockIcon className="size-3" />,
    variant: 'outline',
  },
  error: {
    label: 'Error',
    icon: <AlertCircleIcon className="size-3" />,
    variant: 'destructive',
  },
};

export function ConnectorInstanceList({ instances, definitions }: Props) {
  const deleteMutation = useDeleteConnector();
  const testMutation = useTestConnector();
  const authorizeMutation = useAuthorizeConnector();
  const upgradeMutation = useUpgradeConnector();
  const [testingId, setTestingId] = useState<string | null>(null);

  function getDefinition(connectorId: string) {
    return definitions.find((d) => d.id === connectorId);
  }

  async function handleTest(instanceId: string) {
    setTestingId(instanceId);
    try {
      await testMutation.mutateAsync(instanceId);
      toast.success('Connection test successful');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(instanceId: string, label: string) {
    try {
      await deleteMutation.mutateAsync(instanceId);
      toast.success(`Disconnected ${label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to disconnect');
    }
  }

  async function handleReauthorize(instanceId: string) {
    try {
      const { authUrl } = await authorizeMutation.mutateAsync(instanceId);
      void (window.api?.shell?.openExternal(authUrl) ?? window.open(authUrl, '_blank'));
      toast.info('Opening browser for authorization...');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start authorization');
    }
  }

  async function handleUpgrade(instance: ConnectorInstanceSafe) {
    if (!instance.upgrade?.available) {
      return;
    }

    try {
      let apiKey: string | undefined;
      if (instance.upgrade.actions.includes('rotate_api_key')) {
        const enteredApiKey = window.prompt('Enter the updated API key for this upgrade');
        if (!enteredApiKey?.trim()) {
          return;
        }
        apiKey = enteredApiKey.trim();
      }

      const result = await upgradeMutation.mutateAsync({
        instanceId: instance.id,
        apiKey,
      });

      if (result.type === 'reauthorize') {
        void (window.api?.shell?.openExternal(result.authUrl) ?? window.open(result.authUrl, '_blank'));
        toast.info('Opening browser to complete connector upgrade...');
        return;
      }

      toast.success('Connector upgraded successfully');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to upgrade connector');
    }
  }

  return (
    <div className="space-y-3">
      {instances.map((instance) => {
        const def = getDefinition(instance.connectorId);
        const statusConfig = STATUS_CONFIG[instance.status];
        const isTesting = testingId === instance.id;

        return (
          <div
            key={instance.id}
            className="flex items-center gap-4 rounded-xl border border-border/60 bg-card/80 px-4 py-3.5 text-sm"
          >
            <div className="shrink-0 rounded-lg border border-border/70 bg-muted/70 p-1.5">
              <ConnectorIcon icon={def?.icon ?? instance.connectorId} className="size-7 rounded-md" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{instance.label}</span>
                <Badge variant={statusConfig.variant} className="gap-1">
                  {statusConfig.icon}
                  {statusConfig.label}
                </Badge>
                {instance.upgrade?.available && (
                  <Badge variant="outline" className="gap-1 text-warning">
                    <ArrowUpCircleIcon className="size-3" />
                    Upgrade available
                  </Badge>
                )}
              </div>
              {instance.accountEmail && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {instance.accountEmail}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1">
              {instance.upgrade?.available && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpgrade(instance)}
                  disabled={upgradeMutation.isPending}
                >
                  <ArrowUpCircleIcon className="size-3.5" />
                  Upgrade
                </Button>
              )}
              {(instance.status === 'awaiting_auth' || instance.status === 'error') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReauthorize(instance.id)}
                  disabled={authorizeMutation.isPending}
                >
                  <ExternalLinkIcon className="size-3.5" />
                  Authorize
                </Button>
              )}
              {instance.status === 'connected' && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleTest(instance.id)}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="size-3.5" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDelete(instance.id, instance.label)}
                disabled={deleteMutation.isPending}
              >
                <Trash2Icon className="size-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
