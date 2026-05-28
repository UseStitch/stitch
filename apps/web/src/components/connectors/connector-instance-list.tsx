import {
  Trash2Icon,
  RefreshCwIcon,
  ExternalLinkIcon,
  Loader2Icon,
  ArrowUpCircleIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type {
  ConnectorAuthIssue,
  ConnectorDefinition,
  ConnectorInstanceSafe,
  ConnectorStatus,
} from '@stitch/shared/connectors/types';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
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
  {
    label: string;
    dotClassName: string;
    textClassName: string;
  }
> = {
  connected: {
    label: 'Connected',
    dotClassName: 'bg-success shadow-success-glow',
    textClassName: 'text-success',
  },
  awaiting_auth: {
    label: 'Awaiting Auth',
    dotClassName: 'bg-warning',
    textClassName: 'text-warning',
  },
  pending_setup: {
    label: 'Pending Setup',
    dotClassName: 'bg-muted-foreground',
    textClassName: 'text-muted-foreground',
  },
  error: {
    label: 'Error',
    dotClassName: 'bg-destructive shadow-destructive-glow',
    textClassName: 'text-destructive',
  },
};

const AUTH_ISSUE_COPY: Record<
  ConnectorAuthIssue,
  { label: string; message: string; actionLabel: string }
> = {
  reauthorization_required: {
    label: 'Reauth Required',
    message: 'Google needs you to sign in again for this connector.',
    actionLabel: 'Reauthorize',
  },
  temporary_failure: {
    label: 'Retry Authorization',
    message: 'Authorization hit a temporary issue. Retry to complete the connection.',
    actionLabel: 'Retry Authorization',
  },
};

function getStatusPresentation(instance: ConnectorInstanceSafe) {
  if (instance.status === 'error' && instance.authIssue) {
    const issue = AUTH_ISSUE_COPY[instance.authIssue];
    return {
      ...STATUS_CONFIG.error,
      label: issue.label,
      message: issue.message,
      actionLabel: issue.actionLabel,
    };
  }

  return {
    ...STATUS_CONFIG[instance.status],
    message: null,
    actionLabel: 'Authorize',
  };
}

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
        void (
          window.api?.shell?.openExternal(result.authUrl) ?? window.open(result.authUrl, '_blank')
        );
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
        const statusConfig = getStatusPresentation(instance);
        const isTesting = testingId === instance.id;

        return (
          <div
            key={instance.id}
            className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card/80 px-5 py-4 text-sm sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="shrink-0 rounded-xl border border-border/70 bg-muted/70 p-2">
                <ConnectorIcon
                  icon={def?.icon ?? { type: 'simpleIcons', slug: instance.connectorId }}
                  className="size-8 rounded-lg"
                />
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="leading-6 font-medium">{instance.label}</span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span
                    className={`inline-flex items-center gap-1.5 ${statusConfig.textClassName}`}
                  >
                    <span className={`size-1.5 rounded-full ${statusConfig.dotClassName}`} />
                    {statusConfig.label}
                  </span>
                  {instance.accountEmail && (
                    <>
                      <span className="text-muted-foreground/60">/</span>
                      <span className="truncate text-muted-foreground">
                        {instance.accountEmail}
                      </span>
                    </>
                  )}
                  {instance.upgrade?.available && (
                    <>
                      <span className="text-muted-foreground/60">/</span>
                      <span className="inline-flex items-center gap-1 text-warning">
                        <ArrowUpCircleIcon className="size-3" />
                        Upgrade available
                      </span>
                    </>
                  )}
                </div>
                {statusConfig.message && (
                  <p className="text-xs text-muted-foreground">{statusConfig.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
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
                  {statusConfig.actionLabel}
                </Button>
              )}
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
