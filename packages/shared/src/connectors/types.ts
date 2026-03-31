import type { PrefixedString } from '@stitch/shared/id';

export type ConnectorAuthType = 'oauth2' | 'api_key';

export type ConnectorStatus = 'pending_setup' | 'awaiting_auth' | 'connected' | 'error';

export type ConnectorSetupInstruction = {
  text: string;
  href?: string;
  hrefLabel?: string;
};

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
  defaultScopes: string[];
  scopeDescriptions: Record<string, string>;
  serviceAccessOptions?: OAuthServiceAccessOption[];

  additionalParams?: Record<string, string>;
  /** Maps scopes to the API IDs they require (for generating "Enable APIs" links) */
  scopeApiMap?: Record<string, string>;
};

export type ApiKeyConfig = {
  keyLabel: string;
  placeholder?: string;
  helpUrl?: string;
};

export type ConnectorDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  /** Sub-service icon slugs for display (e.g., gmail, googledrive, googlecalendar) */
  serviceIcons?: string[];
  authType: ConnectorAuthType;
  authConfig: OAuthConfig | ApiKeyConfig;
  setupInstructions: ConnectorSetupInstruction[];
};

export type ConnectorOAuthProfile = {
  id: PrefixedString<'connp'>;
  connectorId: string;
  label: string;
  clientId: string;
  hasClientSecret: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ConnectorInstance = {
  id: PrefixedString<'conn'>;
  connectorId: string;
  label: string;
  oauthProfileId: PrefixedString<'connp'> | null;
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

export type ConnectorInstanceSafe = Omit<
  ConnectorInstance,
  'clientSecret' | 'accessToken' | 'refreshToken' | 'apiKey'
> & {
  hasClientSecret: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasApiKey: boolean;
};
