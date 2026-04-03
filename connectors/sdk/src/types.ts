import type {
  ApiKeyConfig,
  ConnectorAuthType,
  ConnectorSetupInstruction,
  ConnectorStatus,
  ConnectorUpgradeAction,
  ConnectorVersion,
  OAuthConfig,
} from '@stitch/shared/connectors/types';

export type ConnectorIconSource =
  | { type: 'svgString'; svgString: string }
  | { type: 'simpleIcons'; slug: string };

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
  label: string;
  appliedVersion: number;
  capabilities: string[];
  clientId: string | null;
  clientSecret: string | null;
  apiKey: string | null;
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

export type ConnectorToolsetDefinition = {
  id: string;
  name: string;
  description: string;
  icon?: ConnectorIconSource;
  instructions?: string;
  tools: () => { name: string; description: string }[];
  activate: (resolveClient: (account?: string) => Promise<Record<string, unknown>>) => Record<string, unknown>;
};

export type ConnectorLifecycleContext = {
  listInstances: (connectorId: string) => Promise<ConnectorInstanceRecord[]>;
  refreshToolsets: () => Promise<void>;
};

export type ConnectorServiceHooks = {
  onAuthorized?: (input: {
    instance: ConnectorInstanceRecord;
    accessToken: string;
  }) => Promise<{ accountEmail: string | null; accountInfo: Record<string, unknown> | null }>;
  onDeleted?: (input: { instance: ConnectorInstanceRecord }) => Promise<void>;
  testConnection?: (input: { instance: ConnectorInstanceRecord }) => Promise<void>;
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
