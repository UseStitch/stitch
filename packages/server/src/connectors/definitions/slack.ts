import type { ApiKeyConfig, ConnectorDefinition } from '@stitch/shared/connectors/types';

const authConfig: ApiKeyConfig = {
  keyLabel: 'Bot User OAuth Token',
  placeholder: 'xoxb-...',
  helpUrl: 'https://api.slack.com/apps',
};

export const slackConnector: ConnectorDefinition = {
  id: 'slack',
  name: 'Slack',
  description:
    'Connect to your Slack workspace. Read channels, send messages, and search conversations.',
  icon: 'slack',
  enabled: false,
  currentVersion: 1,
  versionHistory: [
    {
      version: 1,
      title: 'Initial Slack connector',
      description: 'Bot token setup for Slack workspace access.',
      action: 'none',
      capabilities: ['slack.channels.read', 'slack.channels.write', 'slack.search.read'],
    },
  ],
  authType: 'api_key',
  authConfig,
  setupInstructions: [
    {
      text: 'Open the Slack API portal',
      href: 'https://api.slack.com/apps',
      hrefLabel: 'Slack API Apps',
    },
    { text: 'Click Create New App -> From scratch' },
    { text: 'Give it a name (for example, Stitch Bot) and select your workspace' },
    { text: 'Navigate to OAuth & Permissions in the sidebar' },
    {
      text: 'Under Scopes -> Bot Token Scopes, add channels:read, channels:history, chat:write, users:read',
    },
    {
      text: 'Add search:read under User Token Scopes if you need Slack search support',
    },
    { text: 'Click Install to Workspace and authorize the app' },
    { text: 'Copy the Bot User OAuth Token (starts with xoxb-)' },
    {
      text: 'If needed, copy User OAuth Token (starts with xoxp-) for user-scoped search access',
    },
  ],
};
