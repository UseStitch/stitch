import { PlusIcon, CheckCircle2Icon } from 'lucide-react';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConnectorIcon } from '@/components/connectors/connector-icon';

type ConnectorCardProps = {
  definition: ConnectorDefinition;
  instanceCount: number;
  onSetup: () => void;
};

export function ConnectorCard({ definition, instanceCount, onSetup }: ConnectorCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <ConnectorIcon icon={definition.icon} className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <CardTitle>{definition.name}</CardTitle>
            <CardDescription className="mt-0.5 line-clamp-2">
              {definition.description}
            </CardDescription>
            {definition.serviceIcons && definition.serviceIcons.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                {definition.serviceIcons.map((slug) => (
                  <ConnectorIcon key={slug} icon={slug} className="size-4 opacity-60" />
                ))}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {instanceCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2Icon className="size-3" />
                {instanceCount} connected
              </span>
            ) : (
              <span>Not connected</span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onSetup}>
            <PlusIcon className="size-3.5" />
            {instanceCount > 0 ? 'Add Another' : 'Connect'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
