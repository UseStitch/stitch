import { useSuspenseQuery } from '@tanstack/react-query';
import { PlugIcon } from 'lucide-react';
import { useState } from 'react';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import { ConnectorCard } from '@/components/connectors/connector-card';
import { ConnectorInstanceList } from '@/components/connectors/connector-instance-list';
import { SetupWizard } from '@/components/connectors/setup-wizard';
import {
  connectorDefinitionsQueryOptions,
  connectorInstancesQueryOptions,
} from '@/lib/queries/connectors';

export function ConnectorsPage() {
  const { data: definitions } = useSuspenseQuery(connectorDefinitionsQueryOptions);
  const { data: instances } = useSuspenseQuery(connectorInstancesQueryOptions);
  const [setupConnector, setSetupConnector] = useState<ConnectorDefinition | null>(null);

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

        {instances.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Connected</h2>
            <ConnectorInstanceList instances={instances} definitions={definitions} />
          </div>
        )}

        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Available Connectors</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {definitions.map((def) => {
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
        </div>
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
