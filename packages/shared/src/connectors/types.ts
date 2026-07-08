import type { PrefixedString } from '@stitch/shared/id';

export type ConnectorAuthType = 'oauth2' | 'api_key';

export type ConnectorIconSource = { type: 'svgString'; svgString: string } | { type: 'simpleIcons'; slug: string };

export type ConnectorUpgradeAction = 'none' | 'reauthorize' | 'rotate_api_key';

export type ConnectorStatus = 'pending_setup' | 'awaiting_auth' | 'connected' | 'error';

export type ConnectorAuthIssue = 'reauthorization_required' | 'temporary_failure';

export type ConnectorSetupInstruction = { text: string; href?: string; hrefLabel?: string };

export type OAuthServiceAccessOption = {
  id: string;
  label: string;
  description?: string;
  readScopes: readonly string[];
  writeScopes?: readonly string[];
};

export type OAuthConfig = {
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  issuer?: string;
  defaultScopes: string[];
  scopeDescriptions: Record<string, string>;
  serviceAccessOptions?: OAuthServiceAccessOption[];

  additionalParams?: Record<string, string>;
  incrementalAuth?: { enabled: boolean; params?: Record<string, string> };
  /** Maps scopes to the API IDs they require (for generating "Enable APIs" links) */
  scopeApiMap?: Record<string, string>;
};

export type ApiKeyConfig = { keyLabel: string; placeholder?: string; helpUrl?: string };

export type ConnectorDefinition = {
  id: string;
  name: string;
  description: string;
  icon: ConnectorIconSource;
  enabled: boolean;
  currentVersion: number;
  versionHistory: ConnectorVersion[];
  /** Sub-service icons for display (e.g., gmail, googledrive, googlecalendar). */
  serviceIcons?: Record<string, ConnectorIconSource>;
  authType: ConnectorAuthType;
  authConfig: OAuthConfig | ApiKeyConfig;
  setupInstructions: ConnectorSetupInstruction[];
};

export type ConnectorBase = {
  id: PrefixedString<'cnr'>;
  connectorId: string;
  label: string;
  createdAt: number;
  updatedAt: number;
};

export type OAuthConnector = ConnectorBase & { authType: 'oauth2'; clientId: string; clientSecret: string };

export type ApiKeyConnector = ConnectorBase & { authType: 'api_key'; apiKey: string };

export type Connector = OAuthConnector | ApiKeyConnector;

export type OAuthConnectorSafe = Omit<OAuthConnector, 'clientSecret'> & { hasClientSecret: boolean };

export type ApiKeyConnectorSafe = Omit<ApiKeyConnector, 'apiKey'> & { hasApiKey: boolean };

export type ConnectorSafe = OAuthConnectorSafe | ApiKeyConnectorSafe;

export type ConnectorVersion = {
  version: number;
  title: string;
  description: string;
  action: ConnectorUpgradeAction;
  capabilities: string[];
  requiredScopes?: string[];
};

export type ConnectorInstance = {
  id: PrefixedString<'conn'>;
  connectorId: string;
  connectorRefId: PrefixedString<'cnr'>;
  label: string;
  appliedVersion: number;
  capabilities: string[];
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: number | null;
  scopes: string[] | null;
  status: ConnectorStatus;
  authIssue: ConnectorAuthIssue | null;
  accountEmail: string | null;
  accountInfo: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
};

export type ConnectorInstanceSafe = Omit<ConnectorInstance, 'accessToken' | 'refreshToken'> & {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  upgrade: {
    available: boolean;
    fromVersion: number;
    toVersion: number;
    actions: ConnectorUpgradeAction[];
    title: string;
    description: string;
    missingScopes: string[];
    newCapabilities: string[];
  } | null;
};
