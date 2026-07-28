import { Trash2Icon, RefreshCwIcon, ExternalLinkIcon, ArrowUpCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type {
  ConnectorAuthIssue,
  ConnectorDefinition,
  ConnectorInstanceSafe,
  ConnectorStatus,
} from '@stitch/shared/connectors/types';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text, type TextProps } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { StatusDot, statusDotVariants } from '@/components/ui/status-dot';
import { getErrorMessage } from '@/lib/errors';
import {
  useAuthorizeConnector,
  useDeleteConnector,
  useTestConnector,
  useUpgradeConnector,
} from '@/lib/queries/connectors';
import type { VariantProps } from 'class-variance-authority';

type Props = { instances: ConnectorInstanceSafe[]; definitions: ConnectorDefinition[] };

const STATUS_CONFIG: Record<
  ConnectorStatus,
  {
    label: string;
    dotColor: NonNullable<VariantProps<typeof statusDotVariants>['color']>;
    glow?: boolean;
    tone: NonNullable<TextProps['tone']>;
  }
> = {
  connected: { label: 'Connected', dotColor: 'success', glow: true, tone: 'success' },
  awaiting_auth: { label: 'Awaiting Auth', dotColor: 'warning', tone: 'warning' },
  pending_setup: { label: 'Pending Setup', dotColor: 'muted', tone: 'muted' },
  error: { label: 'Error', dotColor: 'destructive', glow: true, tone: 'destructive' },
};

const AUTH_ISSUE_COPY: Record<ConnectorAuthIssue, { label: string; message: string; actionLabel: string }> = {
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
    return { ...STATUS_CONFIG.error, label: issue.label, message: issue.message, actionLabel: issue.actionLabel };
  }

  return { ...STATUS_CONFIG[instance.status], message: null, actionLabel: 'Authorize' };
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
      toast.success('Connection test successful', { id: 'connector-test' });
    } catch (e) {
      toast.error(getErrorMessage(e, 'Connection test failed'), { id: 'connector-test' });
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(instanceId: string, label: string) {
    try {
      await deleteMutation.mutateAsync(instanceId);
      toast.success(`Disconnected ${label}`, { id: 'connector-delete' });
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to disconnect'), { id: 'connector-delete' });
    }
  }

  async function handleReauthorize(instanceId: string) {
    try {
      const { authUrl } = await authorizeMutation.mutateAsync(instanceId);
      void (window.api?.shell?.openExternal(authUrl) ?? window.open(authUrl, '_blank'));
      toast.info('Opening browser for authorization...', { id: 'connector-auth' });
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to start authorization'), { id: 'connector-auth' });
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

      const result = await upgradeMutation.mutateAsync({ instanceId: instance.id, apiKey });

      if (result.type === 'reauthorize') {
        void (window.api?.shell?.openExternal(result.authUrl) ?? window.open(result.authUrl, '_blank'));
        toast.info('Opening browser to complete connector upgrade...', { id: 'connector-upgrade' });
        return;
      }

      toast.success('Connector upgraded successfully', { id: 'connector-upgrade' });
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to upgrade connector'), { id: 'connector-upgrade' });
    }
  }

  return (
    <div className="space-y-space-l">
      {instances.map((instance) => {
        const def = getDefinition(instance.connectorId);
        const statusConfig = getStatusPresentation(instance);
        const isTesting = testingId === instance.id;
        const canReauthorize = def?.authType === 'oauth2';

        return (
          <div
            key={instance.id}
            className="rounded-xl border border-border-subtle bg-card px-space-xl py-space-xl text-sm sm:*:flex-row sm:*:items-center">
            <Stack gap="xl">
              <div className="min-w-0 flex-1">
                <Stack direction="row" align="start" gap="xl">
                  <div className="shrink-0 rounded-xl border border-border-subtle bg-surface-sunken p-space-m">
                    <ConnectorIcon
                      icon={def?.icon ?? { type: 'simpleIcons', slug: instance.connectorId }}
                      className="size-8 rounded-lg"
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-space-m">
                    <div className="leading-6">
                      <Text as="span" variant="body-strong">
                        {instance.label}
                      </Text>
                    </div>
                    <div className="min-w-0 text-xs *:gap-x-space-m *:gap-y-space-xs">
                      <Stack direction="row" align="center" wrap>
                        <span className="inline-flex items-center gap-space-s">
                          <StatusDot color={statusConfig.dotColor} glow={statusConfig.glow} size="sm" />
                          <Text as="span" variant="caption" tone={statusConfig.tone}>
                            {statusConfig.label}
                          </Text>
                        </span>
                        {instance.accountEmail && (
                          <>
                            <Text as="span" variant="caption" tone="faint">
                              /
                            </Text>
                            <Text as="span" variant="caption" tone="muted" truncate>
                              {instance.accountEmail}
                            </Text>
                          </>
                        )}
                        {instance.upgrade?.available && (
                          <>
                            <Text as="span" variant="caption" tone="faint">
                              /
                            </Text>
                            <span className="inline-flex items-center gap-space-xs">
                              <Icon as={ArrowUpCircleIcon} size="xs" />
                              <Text as="span" variant="caption" tone="warning">
                                Upgrade available
                              </Text>
                            </span>
                          </>
                        )}
                      </Stack>
                    </div>
                    {statusConfig.message && (
                      <Text as="p" variant="caption" tone="muted">
                        {statusConfig.message}
                      </Text>
                    )}
                  </div>
                </Stack>
              </div>

              <div className="self-end sm:self-auto">
                <Stack direction="row" align="center" gap="m">
                  {instance.upgrade?.available && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpgrade(instance)}
                      disabled={upgradeMutation.isPending}>
                      <Icon as={ArrowUpCircleIcon} size="s" />
                      Upgrade
                    </Button>
                  )}
                  {canReauthorize && (instance.status === 'awaiting_auth' || instance.status === 'error') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReauthorize(instance.id)}
                      disabled={authorizeMutation.isPending}>
                      <Icon as={ExternalLinkIcon} size="s" />
                      {statusConfig.actionLabel}
                    </Button>
                  )}
                  {canReauthorize && instance.status === 'connected' && !instance.upgrade?.available && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReauthorize(instance.id)}
                      disabled={authorizeMutation.isPending}>
                      <Icon as={ExternalLinkIcon} size="s" />
                      Reauthorize
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => handleTest(instance.id)} disabled={isTesting}>
                    {isTesting ? <Spinner size="sm" /> : <Icon as={RefreshCwIcon} size="s" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(instance.id, instance.label)}
                    disabled={deleteMutation.isPending}>
                    <Icon as={Trash2Icon} size="s" color="var(--destructive)" />
                  </Button>
                </Stack>
              </div>
            </Stack>
          </div>
        );
      })}
    </div>
  );
}
