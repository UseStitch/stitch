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
import { DOCS_TOOL_SUMMARIES, createDocsTools } from './docs/tools.js';
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

type BuildGoogleToolsetsInput = {
  scopes: string[];
  capabilities?: string[];
  appliedVersion?: number;
};

function hasCapability(capabilities: string[], capability: string): boolean {
  return capabilities.includes(capability);
}

function createGmailToolset(scopes: string[], capabilities: string[]): GoogleToolsetDefinition {
  const canWrite =
    hasWriteAccess(scopes, 'gmail') && hasCapability(capabilities, 'google.gmail.write');
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

function createDriveToolset(scopes: string[], capabilities: string[]): GoogleToolsetDefinition {
  const canWrite =
    hasWriteAccess(scopes, 'drive') && hasCapability(capabilities, 'google.drive.write');
  const summaries = canWrite
    ? DRIVE_TOOL_SUMMARIES
    : DRIVE_TOOL_SUMMARIES.filter((t) => t.name !== 'drive_write');

  return {
    id: 'google-drive',
    name: 'Google Drive',
    icon: 'googledrive',
    description:
      'Search, read, and create files in Google Drive. Access Google Docs, Sheets, PDFs, and other documents.',
    instructions: [
      'Drive search uses the Google Drive query syntax.',
      "Common queries: \"name contains 'report'\", \"mimeType='application/pdf'\", \"modifiedTime > '2024-01-01'\"",
      "Combine with: and, or, not. Example: \"name contains 'Q4' and mimeType='application/vnd.google-apps.spreadsheet'\"",
      'Google Docs are exported as plain text, Sheets as CSV. Binary files are downloaded directly.',
      canWrite ? 'You have write access. Use drive_write to create new text or Markdown files.' : 'You have read-only access. Creating files is not available.',
    ].join('\n'),
    tools: () => summaries,
    activate: (resolveClient) => createDriveTools(resolveClient, canWrite),
  };
}

function createCalendarToolset(scopes: string[], capabilities: string[]): GoogleToolsetDefinition {
  const canWrite =
    hasWriteAccess(scopes, 'calendar') && hasCapability(capabilities, 'google.calendar.write');
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
      'Always pass the user\'s local IANA timezone (e.g. "America/New_York") so that "today" and time ranges are anchored to their local time, not UTC.',
      'The calendar_list tool defaults to showing upcoming events from now.',
      canWrite ? 'You have write access. Use calendar_create to schedule new events. Pass addMeet: true to automatically attach a Google Meet link.' : 'You have read-only access. Creating events is not available.',
    ].join('\n'),
    tools: () => summaries,
    activate: (resolveClient) => createCalendarTools(resolveClient, canWrite),
  };
}

function createDocsToolset(scopes: string[], capabilities: string[]): GoogleToolsetDefinition {
  const canWrite = hasWriteAccess(scopes, 'docs') && hasCapability(capabilities, 'google.docs.write');
  const summaries = canWrite
    ? DOCS_TOOL_SUMMARIES
    : DOCS_TOOL_SUMMARIES.filter((t) => t.name !== 'docs_create' && t.name !== 'docs_update');

  return {
    id: 'google-docs',
    name: 'Google Docs',
    icon: 'googledocs',
    description:
      'Search, read, create, and update Google Docs documents. Use Docs for structured notes, drafts, and collaborative writing.',
    instructions: [
      'Google Docs search accepts optional Drive query filters (for example: "name contains \'Roadmap\'").',
      'docs_read returns flattened plain text extracted from the document body.',
      canWrite
        ? 'You have write access. Use docs_create to create docs and docs_update to append or replace content.'
        : 'You have read-only access. Creating and updating docs is not available.',
    ].join('\n'),
    tools: () => summaries,
    activate: (resolveClient) => createDocsTools(resolveClient, canWrite),
  };
}

/**
 * Build the list of Google toolset definitions based on the granted scopes.
 * Only services that the user has authorized will be included.
 */
export function buildGoogleToolsets(input: string[] | BuildGoogleToolsetsInput): GoogleToolsetDefinition[] {
  const normalizedInput = Array.isArray(input) ? { scopes: input } : input;
  const scopes = normalizedInput.scopes;
  const capabilities = normalizedInput.capabilities ?? [
    'google.gmail.read',
    'google.gmail.write',
    'google.drive.read',
    'google.drive.write',
    'google.calendar.read',
    'google.calendar.write',
    'google.docs.read',
    'google.docs.write',
  ];
  const toolsets: GoogleToolsetDefinition[] = [];

  if (hasServiceAccess(scopes, 'gmail') && hasCapability(capabilities, 'google.gmail.read')) {
    toolsets.push(createGmailToolset(scopes, capabilities));
  }

  if (hasServiceAccess(scopes, 'drive') && hasCapability(capabilities, 'google.drive.read')) {
    toolsets.push(createDriveToolset(scopes, capabilities));
  }

  if (hasServiceAccess(scopes, 'calendar') && hasCapability(capabilities, 'google.calendar.read')) {
    toolsets.push(createCalendarToolset(scopes, capabilities));
  }

  if (hasServiceAccess(scopes, 'docs') && hasCapability(capabilities, 'google.docs.read')) {
    toolsets.push(createDocsToolset(scopes, capabilities));
  }

  return toolsets;
}
