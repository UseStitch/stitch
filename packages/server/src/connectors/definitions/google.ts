import type { ConnectorDefinition, OAuthConfig } from '@stitch/shared/connectors/types';

const SERVICE_ACCESS_OPTIONS = [
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Search, read, and draft emails',
    readScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    writeScopes: ['https://www.googleapis.com/auth/gmail.modify'],
  },
  {
    id: 'drive',
    label: 'Google Drive',
    description: 'Search and read files from Drive',
    readScopes: ['https://www.googleapis.com/auth/drive.readonly'],
    writeScopes: ['https://www.googleapis.com/auth/drive.file'],
  },
  {
    id: 'calendar',
    label: 'Google Calendar',
    description: 'View and manage calendar events',
    readScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    writeScopes: ['https://www.googleapis.com/auth/calendar.events'],
  },
  {
    id: 'docs',
    label: 'Google Docs',
    description: 'Search, read, and edit Google Docs documents',
    readScopes: ['https://www.googleapis.com/auth/documents.readonly'],
    writeScopes: ['https://www.googleapis.com/auth/documents'],
  },
] as const;

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
  'https://www.googleapis.com/auth/documents.readonly': 'Read your Google Docs documents',
  'https://www.googleapis.com/auth/documents': 'Create and edit your Google Docs documents',
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
  'https://www.googleapis.com/auth/documents.readonly': 'docs.googleapis.com',
  'https://www.googleapis.com/auth/documents': 'docs.googleapis.com',
};

const authConfig: OAuthConfig = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  defaultScopes: GOOGLE_DEFAULT_SCOPES,
  scopeDescriptions: GOOGLE_SCOPES,
  serviceAccessOptions: [...SERVICE_ACCESS_OPTIONS],
  scopeApiMap: GOOGLE_SCOPE_API_MAP,
  additionalParams: {
    access_type: 'offline',
    prompt: 'consent',
  },
};

export const googleConnector: ConnectorDefinition = {
  id: 'google',
  name: 'Google Workspace',
  description: 'Connect Gmail, Drive, and Calendar in one place.',
  icon: 'google',
  enabled: true,
  currentVersion: 2,
  versionHistory: [
    {
      version: 1,
      title: 'Initial Google Workspace connector',
      description: 'Base support for Gmail, Drive, and Calendar.',
      action: 'none',
      capabilities: [
        'google.gmail.read',
        'google.gmail.write',
        'google.drive.read',
        'google.drive.write',
        'google.calendar.read',
        'google.calendar.write',
      ],
      requiredScopes: GOOGLE_DEFAULT_SCOPES,
    },
    {
      version: 2,
      title: 'Google Docs support',
      description: 'Adds Google Docs read and write tools.',
      action: 'reauthorize',
      capabilities: ['google.docs.read', 'google.docs.write'],
      requiredScopes: ['https://www.googleapis.com/auth/documents'],
    },
  ],
  serviceIcons: ['gmail', 'googledrive', 'googlecalendar', 'googledocs'],
  authType: 'oauth2',
  authConfig,
  setupInstructions: [
    {
      text: 'Open Google Cloud Console',
      href: 'https://console.cloud.google.com',
      hrefLabel: 'Google Cloud Console',
    },
    { text: 'Create a new project or select an existing one' },
    { text: 'Go to APIs & Services -> Credentials' },
    { text: 'Click Create Credentials -> OAuth client ID' },
    { text: 'Select Desktop app as the application type' },
    { text: 'Give it a name (for example, Stitch Desktop)' },
    { text: 'Copy the Client ID and Client Secret' },
    {
      text: 'Enable APIs for services you plan to use (Gmail API, Google Drive API, Google Calendar API, Google Docs API)',
      href: 'https://console.cloud.google.com/apis/library',
      hrefLabel: 'Google API Library',
    },
    {
      text: 'Add your email as a test user in OAuth consent screen while app is in testing mode',
      href: 'https://console.cloud.google.com/apis/credentials/consent',
      hrefLabel: 'OAuth Consent Screen',
    },
  ],
};
