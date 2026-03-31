/**
 * Scope-aware Google toolset definitions.
 *
 * Each toolset is only registered when the connector instance has granted
 * the relevant scopes. Write tools (send, create) are only included when
 * the scopes allow it.
 */

import type { GoogleClient } from './client.js';
import { GMAIL_TOOL_SUMMARIES, createGmailTools } from './gmail/tools.js';
import { DRIVE_TOOL_SUMMARIES, createDriveTools } from './drive/tools.js';
import { CALENDAR_TOOL_SUMMARIES, createCalendarTools } from './calendar/tools.js';
import { hasServiceAccess, hasWriteAccess } from './scopes.js';

export type GoogleToolsetDefinition = {
  id: string;
  name: string;
  description: string;
  /** Icon slug for frontend display (e.g. "gmail", "googledrive", "googlecalendar"). */
  icon?: string;
  instructions?: string;
  tools: () => { name: string; description: string }[];
  activate: (resolveClient: Resolver) => Record<string, unknown>;
};

type Resolver = (account?: string) => Promise<{ client: GoogleClient; usedAccount: string | null }>;

function createGmailToolset(scopes: string[]): GoogleToolsetDefinition {
  const canWrite = hasWriteAccess(scopes, 'gmail');
  const summaries = canWrite
    ? GMAIL_TOOL_SUMMARIES
    : GMAIL_TOOL_SUMMARIES.filter((t) => t.name !== 'gmail_send');

  return {
    id: 'google-gmail',
    name: 'Google Gmail',
    icon: 'gmail',
    description:
      'Search, read, and send emails via Gmail. Activate to access your inbox, search messages, and compose emails.',
    instructions: [
      'Gmail tools use standard Gmail search syntax for queries.',
      'Common operators: from:, to:, subject:, is:unread, is:starred, has:attachment, newer_than:, older_than:, label:',
      'Example queries: "from:boss@company.com newer_than:7d", "subject:invoice is:unread", "has:attachment filename:pdf"',
      canWrite ? 'You have send access. Use gmail_send to compose or reply to emails.' : 'You have read-only access. Sending emails is not available.',
    ].join('\n'),
    tools: () => summaries,
    activate: (resolveClient) => createGmailTools(resolveClient, canWrite),
  };
}

function createDriveToolset(): GoogleToolsetDefinition {
  return {
    id: 'google-drive',
    name: 'Google Drive',
    icon: 'googledrive',
    description:
      'Search and read files from Google Drive. Access Google Docs, Sheets, PDFs, and other documents.',
    instructions: [
      'Drive search uses the Google Drive query syntax.',
      "Common queries: \"name contains 'report'\", \"mimeType='application/pdf'\", \"modifiedTime > '2024-01-01'\"",
      "Combine with: and, or, not. Example: \"name contains 'Q4' and mimeType='application/vnd.google-apps.spreadsheet'\"",
      'Google Docs are exported as plain text, Sheets as CSV. Binary files are downloaded directly.',
    ].join('\n'),
    tools: () => DRIVE_TOOL_SUMMARIES,
    activate: (resolveClient) => createDriveTools(resolveClient),
  };
}

function createCalendarToolset(scopes: string[]): GoogleToolsetDefinition {
  const canWrite = hasWriteAccess(scopes, 'calendar');
  const summaries = canWrite
    ? CALENDAR_TOOL_SUMMARIES
    : CALENDAR_TOOL_SUMMARIES.filter((t) => t.name !== 'calendar_create');

  return {
    id: 'google-calendar',
    name: 'Google Calendar',
    icon: 'googlecalendar',
    description:
      'View and manage Google Calendar events. Check upcoming meetings, search events, and create new ones.',
    instructions: [
      'Calendar tools default to the primary calendar. Use calendarId parameter for other calendars.',
      'Time parameters use ISO 8601 format (e.g., "2025-06-15T10:00:00Z").',
      'The calendar_list tool defaults to showing upcoming events from now.',
      canWrite ? 'You have write access. Use calendar_create to schedule new events.' : 'You have read-only access. Creating events is not available.',
    ].join('\n'),
    tools: () => summaries,
    activate: (resolveClient) => createCalendarTools(resolveClient, canWrite),
  };
}

/**
 * Build the list of Google toolset definitions based on the granted scopes.
 * Only services that the user has authorized will be included.
 */
export function buildGoogleToolsets(scopes: string[]): GoogleToolsetDefinition[] {
  const toolsets: GoogleToolsetDefinition[] = [];

  if (hasServiceAccess(scopes, 'gmail')) {
    toolsets.push(createGmailToolset(scopes));
  }

  if (hasServiceAccess(scopes, 'drive')) {
    toolsets.push(createDriveToolset());
  }

  if (hasServiceAccess(scopes, 'calendar')) {
    toolsets.push(createCalendarToolset(scopes));
  }

  return toolsets;
}
