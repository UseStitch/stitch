import { useSuspenseQuery } from '@tanstack/react-query';
import { PlugIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import { ConnectorCard } from '@/components/connectors/connector-card';
import { ConnectorInstanceList } from '@/components/connectors/connector-instance-list';
import { SetupWizard } from '@/components/connectors/setup-wizard';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  connectorDefinitionsQueryOptions,
  connectorInstancesQueryOptions,
} from '@/lib/queries/connectors';

export function ConnectorsPage() {
  const { data: definitions } = useSuspenseQuery(connectorDefinitionsQueryOptions);
  const { data: instances } = useSuspenseQuery(connectorInstancesQueryOptions);
  const [setupConnector, setSetupConnector] = useState<ConnectorDefinition | null>(null);
  const [search, setSearch] = useState('');
  const pendingUpdates = instances.filter((instance) => instance.upgrade?.available).length;

  const filteredDefinitions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return definitions;

    return definitions.filter((definition) => {
      const searchableText = `${definition.name} ${definition.description}`.toLowerCase();
      return searchableText.includes(query);
    });
  }, [definitions, search]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PlugIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Connectors</h1>
            <p className="text-sm text-muted-foreground">
              Connect your third-party services. Bring your own credentials.
            </p>
          </div>
        </div>

        <Tabs defaultValue="marketplace" className="gap-4">
          <TabsList>
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
            <TabsTrigger value="connected" className="gap-2">
              Connected
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                {instances.length}
              </Badge>
              {pendingUpdates > 0 ? (
                <span className="size-2 rounded-full bg-warning" aria-label="Upgrades available" />
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="marketplace" className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Available Connectors</h2>
            <div className="relative">
              <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search connectors"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {filteredDefinitions.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {filteredDefinitions.map((def) => {
                  const instanceCount = instances.filter((i) => i.connectorId === def.id).length;
                  return (
                    <ConnectorCard
                      key={def.id}
                      definition={def}
                      instanceCount={instanceCount}
                      onSetup={() => setSetupConnector(def)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center">
                <p className="text-sm font-medium">No connectors match your search</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a different name or clear the search query.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="connected" className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Connected Instances</h2>
            {instances.length > 0 ? (
              <ConnectorInstanceList instances={instances} definitions={definitions} />
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center">
                <p className="text-sm font-medium">No connected instances yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open Marketplace to connect your first service.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {setupConnector && (
        <SetupWizard
          definition={setupConnector}
          onClose={() => setSetupConnector(null)}
        />
      )}
    </div>
  );
}
