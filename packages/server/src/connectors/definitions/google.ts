import type { ConnectorDefinition, OAuthConfig } from '@stitch/shared/connectors/types';
import {
  GOOGLE_DEFAULT_SCOPES,
  GOOGLE_SCOPE_CALENDAR,
  GOOGLE_SCOPE_CALENDAR_EVENTS,
  GOOGLE_SCOPE_CALENDAR_READONLY,
  GOOGLE_SCOPE_DOCS,
  GOOGLE_SCOPE_DOCS_READONLY,
  GOOGLE_SCOPE_DRIVE,
  GOOGLE_SCOPE_DRIVE_FILE,
  GOOGLE_SCOPE_DRIVE_READONLY,
  GOOGLE_SCOPE_GMAIL_MODIFY,
  GOOGLE_SCOPE_GMAIL_READONLY,
  GOOGLE_SCOPE_GMAIL_SEND,
  GOOGLE_SCOPE_USERINFO_EMAIL,
} from '@stitch/google/scopes';
import {
  GOOGLE_CAPABILITY_CALENDAR_READ,
  GOOGLE_CAPABILITY_CALENDAR_WRITE,
  GOOGLE_CAPABILITY_DOCS_READ,
  GOOGLE_CAPABILITY_DOCS_WRITE,
  GOOGLE_CAPABILITY_DRIVE_READ,
  GOOGLE_CAPABILITY_DRIVE_WRITE,
  GOOGLE_CAPABILITY_GMAIL_READ,
  GOOGLE_CAPABILITY_GMAIL_WRITE,
} from '@stitch/google/toolsets';

const SERVICE_ACCESS_OPTIONS = [
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Search, read, and draft emails',
    readScopes: [GOOGLE_SCOPE_GMAIL_READONLY],
    writeScopes: [GOOGLE_SCOPE_GMAIL_MODIFY],
  },
  {
    id: 'drive',
    label: 'Google Drive',
    description: 'Search and read files from Drive',
    readScopes: [GOOGLE_SCOPE_DRIVE_READONLY],
    writeScopes: [GOOGLE_SCOPE_DRIVE_FILE],
  },
  {
    id: 'calendar',
    label: 'Google Calendar',
    description: 'View and manage calendar events',
    readScopes: [GOOGLE_SCOPE_CALENDAR_READONLY],
    writeScopes: [GOOGLE_SCOPE_CALENDAR_EVENTS],
  },
  {
    id: 'docs',
    label: 'Google Docs',
    description: 'Search, read, and edit Google Docs documents',
    readScopes: [GOOGLE_SCOPE_DOCS_READONLY],
    writeScopes: [GOOGLE_SCOPE_DOCS],
  },
] as const;

const GOOGLE_SCOPES = {
  openid: 'Verify your identity',
  [GOOGLE_SCOPE_USERINFO_EMAIL]: 'View your email address',
  [GOOGLE_SCOPE_GMAIL_READONLY]: 'Read your Gmail messages',
  [GOOGLE_SCOPE_GMAIL_SEND]: 'Send emails on your behalf',
  [GOOGLE_SCOPE_GMAIL_MODIFY]: 'Read, send, and manage your Gmail',
  [GOOGLE_SCOPE_DRIVE_READONLY]: 'View files in your Google Drive',
  [GOOGLE_SCOPE_DRIVE_FILE]: 'Create and edit files in Google Drive',
  [GOOGLE_SCOPE_DRIVE]: 'Full access to Google Drive',
  [GOOGLE_SCOPE_CALENDAR_READONLY]: 'View your Google Calendar',
  [GOOGLE_SCOPE_CALENDAR_EVENTS]: 'Create and edit calendar events',
  [GOOGLE_SCOPE_CALENDAR]: 'Full access to Google Calendar',
  [GOOGLE_SCOPE_DOCS_READONLY]: 'Read your Google Docs documents',
  [GOOGLE_SCOPE_DOCS]: 'Create and edit your Google Docs documents',
} as const;

const GOOGLE_SCOPE_API_MAP: Record<string, string> = {
  [GOOGLE_SCOPE_GMAIL_READONLY]: 'gmail.googleapis.com',
  [GOOGLE_SCOPE_GMAIL_SEND]: 'gmail.googleapis.com',
  [GOOGLE_SCOPE_GMAIL_MODIFY]: 'gmail.googleapis.com',
  [GOOGLE_SCOPE_DRIVE_READONLY]: 'drive.googleapis.com',
  [GOOGLE_SCOPE_DRIVE_FILE]: 'drive.googleapis.com',
  [GOOGLE_SCOPE_DRIVE]: 'drive.googleapis.com',
  [GOOGLE_SCOPE_CALENDAR_READONLY]: 'calendar-json.googleapis.com',
  [GOOGLE_SCOPE_CALENDAR_EVENTS]: 'calendar-json.googleapis.com',
  [GOOGLE_SCOPE_CALENDAR]: 'calendar-json.googleapis.com',
  [GOOGLE_SCOPE_DOCS_READONLY]: 'docs.googleapis.com',
  [GOOGLE_SCOPE_DOCS]: 'docs.googleapis.com',
};

const authConfig: OAuthConfig = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  defaultScopes: [...GOOGLE_DEFAULT_SCOPES],
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
        GOOGLE_CAPABILITY_GMAIL_READ,
        GOOGLE_CAPABILITY_GMAIL_WRITE,
        GOOGLE_CAPABILITY_DRIVE_READ,
        GOOGLE_CAPABILITY_DRIVE_WRITE,
        GOOGLE_CAPABILITY_CALENDAR_READ,
        GOOGLE_CAPABILITY_CALENDAR_WRITE,
      ],
      requiredScopes: [...GOOGLE_DEFAULT_SCOPES],
    },
    {
      version: 2,
      title: 'Google Docs support',
      description: 'Adds Google Docs read and write tools.',
      action: 'reauthorize',
      capabilities: [GOOGLE_CAPABILITY_DOCS_READ, GOOGLE_CAPABILITY_DOCS_WRITE],
      requiredScopes: [GOOGLE_SCOPE_DOCS],
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
