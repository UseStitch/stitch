import type { ConnectorDefinition, ConnectorInstance } from '@stitch/shared/connectors/types';
import type { StitchLogger } from '@stitch/shared/logger';

type ConnectorLifecycleContext = {
  listInstances: (connectorId: string) => Promise<ConnectorInstance[]>;
  refreshToolsets: () => Promise<void>;
  logger: StitchLogger;
};

type ConnectorServiceHooks = {
  onAuthorized?: (input: {
    instance: ConnectorInstance;
    accessToken: string;
    logger: StitchLogger;
  }) => Promise<{ accountEmail: string | null; accountInfo: Record<string, unknown> | null }>;
  testConnection?: (input: { instance: ConnectorInstance; logger: StitchLogger }) => Promise<void>;
};

export type ConnectorModule = {
  definition: ConnectorDefinition;
  hooks?: ConnectorServiceHooks;
  lifecycle?: { init?: (context: ConnectorLifecycleContext) => Promise<void> };
};
