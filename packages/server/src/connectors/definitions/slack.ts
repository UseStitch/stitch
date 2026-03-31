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
  authType: 'api_key',
  authConfig,
  setupInstructions: [
    'Go to the Slack API portal (https://api.slack.com/apps)',
    'Click "Create New App" → "From scratch"',
    'Give it a name (e.g., "Stitch Bot") and select your workspace',
    'Navigate to "OAuth & Permissions" in the sidebar',
    'Under "Scopes" → "Bot Token Scopes", add the scopes you need:',
    '  - channels:read — View basic channel info',
    '  - channels:history — Read messages in public channels',
    '  - chat:write — Send messages',
    '  - users:read — View user profiles',
    '  - search:read — Search messages (requires a User Token scope, see below)',
    'Click "Install to Workspace" at the top of the OAuth page',
    'Authorize the app when prompted',
    'Copy the "Bot User OAuth Token" (starts with xoxb-)',
    'Note: For search functionality, you may also need a User Token. Go to "User Token Scopes" and add search:read, then copy the "User OAuth Token" (starts with xoxp-)',
  ],
};
