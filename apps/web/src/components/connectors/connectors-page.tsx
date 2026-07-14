import { PlugIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import { ConnectorCard } from '@/components/connectors/connector-card';
import { ConnectorInstanceList } from '@/components/connectors/connector-instance-list';
import { SetupWizard } from '@/components/connectors/setup-wizard';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import {
  Page,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeaderContent,
  PageIcon,
  PageTitle,
} from '@/components/ui/page';
import { SearchInput } from '@/components/ui/search-input';
import { StatusDot } from '@/components/ui/status-dot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  connectorDefinitionsQueryOptions,
  connectorInstancesQueryOptions,
  connectorsQueryOptions,
} from '@/lib/queries/connectors';

export function ConnectorsPage() {
  const { data: definitions } = useSuspenseQuery(connectorDefinitionsQueryOptions);
  const { data: connectors } = useSuspenseQuery(connectorsQueryOptions);
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
    <Page>
      <PageContent>
        <PageHeader>
          <PageHeaderContent>
            <PageIcon>
              <PlugIcon className="size-5" />
            </PageIcon>
            <div>
              <PageTitle>Connectors</PageTitle>
              <PageDescription>Connect your third-party services. Bring your own credentials.</PageDescription>
            </div>
          </PageHeaderContent>
        </PageHeader>

        <Tabs defaultValue="marketplace" className="gap-4">
          <TabsList variant="line">
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
            <TabsTrigger value="connected" className="gap-2">
              Connected
              <Badge variant="secondary" size="sm" className="rounded-full">
                {instances.length}
              </Badge>
              {pendingUpdates > 0 ? <StatusDot color="warning" aria-label="Upgrades available" /> : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="marketplace" className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Available Connectors</h2>
            <SearchInput
              placeholder="Search connectors"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

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
              <Empty surface="muted" size="compact">
                <EmptyTitle>No connectors match your search</EmptyTitle>
                <EmptyDescription>Try a different name or clear the search query.</EmptyDescription>
              </Empty>
            )}
          </TabsContent>

          <TabsContent value="connected" className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Connected Instances</h2>
            {instances.length > 0 ? (
              <ConnectorInstanceList instances={instances} definitions={definitions} />
            ) : (
              <Empty surface="muted" size="compact">
                <EmptyTitle>No connected instances yet</EmptyTitle>
                <EmptyDescription>Open Marketplace to connect your first service.</EmptyDescription>
              </Empty>
            )}
          </TabsContent>
        </Tabs>
      </PageContent>

      {setupConnector && (
        <SetupWizard
          definition={setupConnector}
          connectors={connectors.filter((connector) => connector.connectorId === setupConnector.id)}
          onClose={() => setSetupConnector(null)}
        />
      )}
    </Page>
  );
}
