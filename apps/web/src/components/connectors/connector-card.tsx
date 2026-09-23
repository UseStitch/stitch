import { PlusIcon, CheckCircle2Icon } from 'lucide-react';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type ConnectorCardProps = { definition: ConnectorDefinition; instanceCount: number; onSetup: () => void };

export function ConnectorCard({ definition, instanceCount, onSetup }: ConnectorCardProps) {
  const isConnected = instanceCount > 0;

  return (
    <div className="rounded-xl transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-border-subtle">
      <Card>
        <CardHeader divided className="gap-space-l">
          <Stack direction="row" align="start" gap="l">
            <div className="shrink-0 rounded-lg border border-border-subtle bg-surface-sunken p-space-s">
              <span className="block size-8 overflow-hidden rounded-md">
                <ConnectorIcon icon={definition.icon} className="size-8" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <Stack direction="row" align="start" justify="between" gap="m">
                <CardTitle>{definition.name}</CardTitle>
                <Badge variant="outline">
                  <span className="capitalize">{definition.authType === 'oauth2' ? 'OAuth' : 'API key'}</span>
                </Badge>
              </Stack>
              <CardDescription className="mt-space-xs">
                <span className="line-clamp-2">{definition.description}</span>
              </CardDescription>
            </div>
          </Stack>
        </CardHeader>
        <CardContent>
          <div className="space-y-space-l">
            <Stack direction="row" align="center" justify="between" gap="l">
              <div>
                {isConnected ? (
                  <span className="inline-flex items-center gap-space-xs">
                    <Icon as={CheckCircle2Icon} size="xs" />
                    <Text as="span" variant="caption" tone="success">
                      {instanceCount} connected
                    </Text>
                  </span>
                ) : (
                  <Text as="span" variant="caption" tone="muted">
                    Not connected
                  </Text>
                )}
              </div>
              <Button variant={isConnected ? 'outline' : 'default'} size="sm" onClick={onSetup}>
                <Icon as={PlusIcon} size="s" />
                {isConnected ? 'Add Another' : 'Connect'}
              </Button>
            </Stack>

            {definition.serviceIcons && Object.keys(definition.serviceIcons).length > 0 && (
              <div className="rounded-lg border border-border-subtle bg-surface-sunken p-space-m">
                <Stack direction="row" align="center" gap="s" wrap>
                  {Object.entries(definition.serviceIcons).map(([key, icon]) => (
                    <div key={key} className="rounded-md border border-border-subtle bg-muted p-space-xs">
                      <ConnectorIcon icon={icon} className="size-4" />
                    </div>
                  ))}
                </Stack>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
