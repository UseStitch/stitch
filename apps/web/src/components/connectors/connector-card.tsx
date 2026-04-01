import { PlusIcon, CheckCircle2Icon } from 'lucide-react';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConnectorIcon } from '@/components/connectors/connector-icon';

type ConnectorCardProps = {
  definition: ConnectorDefinition;
  instanceCount: number;
  onSetup: () => void;
};

export function ConnectorCard({ definition, instanceCount, onSetup }: ConnectorCardProps) {
  const isConnected = instanceCount > 0;

  return (
    <Card className="border-border/60 bg-card/70 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-foreground/5">
      <CardHeader className="gap-3 border-b border-border/40 pb-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-lg border border-border/70 bg-muted/70 p-1.5">
            <ConnectorIcon icon={definition.icon} className="size-8 rounded-md" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{definition.name}</CardTitle>
              <Badge variant="outline" className="capitalize">
                {definition.authType === 'oauth2' ? 'OAuth' : 'API key'}
              </Badge>
            </div>
            <CardDescription className="mt-1 line-clamp-2">
              {definition.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {isConnected ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2Icon className="size-3" />
                  {instanceCount} connected
                </span>
              ) : (
                <span>Not connected</span>
              )}
            </div>
            <Button variant={isConnected ? 'outline' : 'default'} size="sm" onClick={onSetup}>
              <PlusIcon className="size-3.5" />
              {isConnected ? 'Add Another' : 'Connect'}
            </Button>
          </div>

          {definition.serviceIcons && definition.serviceIcons.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/60 p-2">
              {definition.serviceIcons.map((slug) => (
                <div key={slug} className="rounded-md border border-border/70 bg-muted p-1">
                  <ConnectorIcon icon={slug} className="size-4" />
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
