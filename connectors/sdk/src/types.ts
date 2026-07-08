import type {
  ApiKeyConfig,
  ConnectorAuthType,
  ConnectorIconSource,
  ConnectorSetupInstruction,
  ConnectorStatus,
  ConnectorUpgradeAction,
  ConnectorVersion,
  OAuthConfig,
} from '@stitch/shared/connectors/types';
import type { StitchLogger } from '@stitch/shared/logger';

export type { ConnectorIconSource } from '@stitch/shared/connectors/types';

export type ConnectorDefinitionInput = {
  id: string;
  name: string;
  description: string;
  icon: ConnectorIconSource;
  enabled: boolean;
  currentVersion: number;
  versionHistory: ConnectorVersion[];
  serviceIcons?: Record<string, ConnectorIconSource>;
  authType: ConnectorAuthType;
  authConfig: OAuthConfig | ApiKeyConfig;
  setupInstructions: ConnectorSetupInstruction[];
};

export type ConnectorInstanceRecord = {
  id: string;
  connectorId: string;
  connectorRefId: string;
  label: string;
  appliedVersion: number;
  capabilities: string[];
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
  scopes: string[] | null;
  status: ConnectorStatus;
  accountEmail: string | null;
  accountInfo: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
};

export type ConnectorLifecycleContext = {
  listInstances: (connectorId: string) => Promise<ConnectorInstanceRecord[]>;
  refreshToolsets: () => Promise<void>;
  logger: StitchLogger;
};

export type ConnectorServiceHooks = {
  onAuthorized?: (input: {
    instance: ConnectorInstanceRecord;
    accessToken: string;
    logger: StitchLogger;
  }) => Promise<{ accountEmail: string | null; accountInfo: Record<string, unknown> | null }>;
  onDeleted?: (input: { instance: ConnectorInstanceRecord; logger: StitchLogger }) => Promise<void>;
  testConnection?: (input: { instance: ConnectorInstanceRecord; logger: StitchLogger }) => Promise<void>;
};

export type ConnectorModule = {
  definition: ConnectorDefinitionInput;
  hooks?: ConnectorServiceHooks;
  lifecycle?: {
    register?: (context: ConnectorLifecycleContext) => Promise<void>;
    init?: (context: ConnectorLifecycleContext) => Promise<void>;
    shutdown?: (context: ConnectorLifecycleContext) => Promise<void>;
  };
};

export type ConnectorUpgradeState = {
  available: boolean;
  fromVersion: number;
  toVersion: number;
  actions: ConnectorUpgradeAction[];
  title: string;
  description: string;
  missingScopes: string[];
  newCapabilities: string[];
} | null;
