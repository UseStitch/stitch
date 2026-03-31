import type { ConnectorDefinition, OAuthConfig } from '@stitch/shared/connectors/types';

const GOOGLE_SCOPES = {
  openid: 'Verify your identity',
  'https://www.googleapis.com/auth/userinfo.email': 'View your email address',
  'https://www.googleapis.com/auth/gmail.readonly': 'Read your Gmail messages',
  'https://www.googleapis.com/auth/gmail.send': 'Send emails on your behalf',
  'https://www.googleapis.com/auth/gmail.modify': 'Read, send, and manage your Gmail',
  'https://www.googleapis.com/auth/drive.readonly': 'View files in your Google Drive',
  'https://www.googleapis.com/auth/drive.file': 'Create and edit files in Google Drive',
  'https://www.googleapis.com/auth/drive': 'Full access to Google Drive',
  'https://www.googleapis.com/auth/calendar.readonly': 'View your Google Calendar',
  'https://www.googleapis.com/auth/calendar.events': 'Create and edit calendar events',
  'https://www.googleapis.com/auth/calendar': 'Full access to Google Calendar',
} as const;

const GOOGLE_DEFAULT_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const GOOGLE_SCOPE_API_MAP: Record<string, string> = {
  'https://www.googleapis.com/auth/gmail.readonly': 'gmail.googleapis.com',
  'https://www.googleapis.com/auth/gmail.send': 'gmail.googleapis.com',
  'https://www.googleapis.com/auth/gmail.modify': 'gmail.googleapis.com',
  'https://www.googleapis.com/auth/drive.readonly': 'drive.googleapis.com',
  'https://www.googleapis.com/auth/drive.file': 'drive.googleapis.com',
  'https://www.googleapis.com/auth/drive': 'drive.googleapis.com',
  'https://www.googleapis.com/auth/calendar.readonly': 'calendar-json.googleapis.com',
  'https://www.googleapis.com/auth/calendar.events': 'calendar-json.googleapis.com',
  'https://www.googleapis.com/auth/calendar': 'calendar-json.googleapis.com',
};

const authConfig: OAuthConfig = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  defaultScopes: GOOGLE_DEFAULT_SCOPES,
  scopeDescriptions: GOOGLE_SCOPES,
  scopeApiMap: GOOGLE_SCOPE_API_MAP,
  additionalParams: {
    access_type: 'offline',
    prompt: 'consent',
  },
};

export const googleConnector: ConnectorDefinition = {
  id: 'google',
  name: 'Google Workspace',
  description:
    'Connect to Gmail, Google Drive, and Google Calendar. Access emails, documents, spreadsheets, and calendar events.',
  icon: 'google',
  serviceIcons: ['gmail', 'googledrive', 'googlecalendar'],
  authType: 'oauth2',
  authConfig,
  setupInstructions: [
    'Go to the Google Cloud Console (https://console.cloud.google.com)',
    'Create a new project or select an existing one',
    'Navigate to "APIs & Services" → "Credentials"',
    'Click "Create Credentials" → "OAuth client ID"',
    'Select "Desktop app" as the application type',
    'Give it a name (e.g., "Stitch Desktop")',
    'Copy the Client ID and Client Secret',
    'Navigate to "APIs & Services" → "Library" and enable the APIs you need: Gmail API, Google Drive API, and/or Google Calendar API (or use the "Enable APIs" button in the next step)',
    'Navigate to "APIs & Services" → "OAuth consent screen" and add your email as a test user (required while the app is in testing mode)',
  ],
};
