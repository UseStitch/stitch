/**
 * Scope-aware Google toolset definitions.
 *
 * Each toolset is only registered when the connector instance has granted
 * the relevant scopes. Write tools (send, create) are only included when
 * the scopes allow it.
 */

import type { ConnectorIconSource } from '@stitch/shared/connectors/types';

import { createCalendarTools } from './calendar/tools.js';
import { createDocsTools } from './docs/tools.js';
import { createDriveTools } from './drive/tools.js';
import { createGmailTools } from './gmail/tools.js';
import {
  hasGmailModifyAccess,
  hasGmailSendAccess,
  hasGmailSettingsAccess,
  hasServiceAccess,
  hasWriteAccess,
} from './scopes.js';

import type { GoogleClient } from './client.js';
import type { Tool } from 'ai';

export const GOOGLE_CAPABILITY_GMAIL_READ = 'google.gmail.read';
export const GOOGLE_CAPABILITY_GMAIL_WRITE = 'google.gmail.write';
export const GOOGLE_CAPABILITY_DRIVE_READ = 'google.drive.read';
export const GOOGLE_CAPABILITY_DRIVE_WRITE = 'google.drive.write';
export const GOOGLE_CAPABILITY_CALENDAR_READ = 'google.calendar.read';
export const GOOGLE_CAPABILITY_CALENDAR_WRITE = 'google.calendar.write';
export const GOOGLE_CAPABILITY_DOCS_READ = 'google.docs.read';
export const GOOGLE_CAPABILITY_DOCS_WRITE = 'google.docs.write';

const GOOGLE_DEFAULT_CAPABILITIES = [
  GOOGLE_CAPABILITY_GMAIL_READ,
  GOOGLE_CAPABILITY_GMAIL_WRITE,
  GOOGLE_CAPABILITY_DRIVE_READ,
  GOOGLE_CAPABILITY_DRIVE_WRITE,
  GOOGLE_CAPABILITY_CALENDAR_READ,
  GOOGLE_CAPABILITY_CALENDAR_WRITE,
  GOOGLE_CAPABILITY_DOCS_READ,
  GOOGLE_CAPABILITY_DOCS_WRITE,
] as const;

export const GOOGLE_TOOLSET_IDS = [
  'google-gmail',
  'google-drive',
  'google-calendar',
  'google-docs',
] as const;

export type GoogleToolsetDefinition = {
  id: string;
  name: string;
  description: string;
  icon?: ConnectorIconSource;
  instructions?: string;
  tools: () => { name: string; description: string }[];
  activate: (resolveClient: Resolver) => Record<string, Tool>;
};

type Resolver = (account?: string) => Promise<{ client: GoogleClient; usedAccount: string | null }>;

const SUMMARY_RESOLVER: Resolver = async () => {
  throw new Error('Summary resolver should not be executed.');
};

function summarizeTools(tools: Record<string, Tool>): { name: string; description: string }[] {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: summarizeToolDescription(tool.description),
  }));
}

function summarizeToolDescription(description: string | undefined): string {
  return (
    description
      ?.split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  );
}

type BuildGoogleToolsetsInput = {
  scopes: string[];
  capabilities?: string[];
  appliedVersion?: number;
  tempPath?: string;
};

const EXACT_TOOL_NAME_INSTRUCTION =
  'Use the exact callable tool names exactly as listed. Do not invent aliases, camelCase variants, or shortened names.';

function hasCapability(capabilities: string[], capability: string): boolean {
  return capabilities.includes(capability);
}

export function canActivateToolset(
  toolsetId: string,
  scopes: string[],
  capabilities: string[],
): boolean {
  if (toolsetId === 'google-gmail') {
    return (
      hasServiceAccess(scopes, 'gmail') && hasCapability(capabilities, GOOGLE_CAPABILITY_GMAIL_READ)
    );
  }
  if (toolsetId === 'google-drive') {
    return (
      hasServiceAccess(scopes, 'drive') && hasCapability(capabilities, GOOGLE_CAPABILITY_DRIVE_READ)
    );
  }
  if (toolsetId === 'google-calendar') {
    return (
      hasServiceAccess(scopes, 'calendar') &&
      hasCapability(capabilities, GOOGLE_CAPABILITY_CALENDAR_READ)
    );
  }
  if (toolsetId === 'google-docs') {
    return (
      hasServiceAccess(scopes, 'docs') && hasCapability(capabilities, GOOGLE_CAPABILITY_DOCS_READ)
    );
  }
  return false;
}

function createGmailToolset(
  scopes: string[],
  capabilities: string[],
  config?: { tempPath?: string },
): GoogleToolsetDefinition {
  const canWriteCapability = hasCapability(capabilities, GOOGLE_CAPABILITY_GMAIL_WRITE);
  const canSend = hasGmailSendAccess(scopes) && canWriteCapability;
  const canModify = hasGmailModifyAccess(scopes) && canWriteCapability;
  const canManageFilters = hasGmailSettingsAccess(scopes) && canWriteCapability;
  const permissions = { canSend, canModify, canManageFilters };

  return {
    id: 'google-gmail',
    name: 'Google Gmail',
    icon: { type: 'simpleIcons', slug: 'gmail' },
    description: canSend
      ? 'Search, read, send, label, and manage Gmail messages and labels.'
      : canModify
        ? 'Search, read, label, and manage Gmail messages without send access.'
        : 'Search and read Gmail messages and inspect Gmail labels.',
    instructions: [
      EXACT_TOOL_NAME_INSTRUCTION,
      'Gmail tools use standard Gmail search syntax for queries.',
      'Common operators: from:, to:, subject:, is:unread, is:starred, has:attachment, newer_than:, older_than:, label:',
      'Example queries: "from:boss@company.com newer_than:7d", "subject:invoice is:unread", "has:attachment filename:pdf"',
      canSend
        ? 'You have send access. Use gmail_send to compose or reply to emails.'
        : 'You do not have send access. Sending emails is not available.',
      canModify
        ? 'You have label modify access. Use gmail_modify_labels with an explicit operation field (create, update, or delete). Use gmail_modify_messages to add or remove labels on messages or threads.'
        : 'You have read-only label access. Use gmail_list_labels and gmail_get_label to inspect labels.',
      canManageFilters
        ? 'You have settings access. Use gmail_filters with an explicit operation field (list, get, create, or delete). To update a filter, delete it and recreate it.'
        : 'You do not have settings access. Managing Gmail filters is not available.',
      'Do not add SPAM and TRASH in the same gmail_modify_messages call. Apply those actions in separate steps if needed.',
    ].join('\n'),
    tools: () => summarizeTools(createGmailTools(SUMMARY_RESOLVER, permissions, config)),
    activate: (resolveClient) => createGmailTools(resolveClient, permissions, config),
  };
}

function createDriveToolset(scopes: string[], capabilities: string[]): GoogleToolsetDefinition {
  const canWrite =
    hasWriteAccess(scopes, 'drive') && hasCapability(capabilities, GOOGLE_CAPABILITY_DRIVE_WRITE);

  return {
    id: 'google-drive',
    name: 'Google Drive',
    icon: { type: 'simpleIcons', slug: 'googledrive' },
    description: canWrite
      ? 'Search, read, and create text files in Google Drive, including access to Docs, Sheets, PDFs, and other documents.'
      : 'Search and read Google Drive files, including Docs, Sheets, PDFs, and other documents.',
    instructions: [
      EXACT_TOOL_NAME_INSTRUCTION,
      'Drive search uses the Google Drive query syntax.',
      'Common queries: "name contains \'report\'", "mimeType=\'application/pdf\'", "modifiedTime > \'2024-01-01\'"',
      "Combine with: and, or, not. Example: \"name contains 'Q4' and mimeType='application/vnd.google-apps.spreadsheet'\"",
      'Google Docs are exported as plain text, Sheets as CSV. Binary files are downloaded directly.',
      canWrite
        ? 'You have write access. Use drive_write to create new text or Markdown files.'
        : 'You have read-only access. Creating files is not available.',
    ].join('\n'),
    tools: () => summarizeTools(createDriveTools(SUMMARY_RESOLVER, canWrite)),
    activate: (resolveClient) => createDriveTools(resolveClient, canWrite),
  };
}

function createCalendarToolset(scopes: string[], capabilities: string[]): GoogleToolsetDefinition {
  const canWrite =
    hasWriteAccess(scopes, 'calendar') &&
    hasCapability(capabilities, GOOGLE_CAPABILITY_CALENDAR_WRITE);

  return {
    id: 'google-calendar',
    name: 'Google Calendar',
    icon: { type: 'simpleIcons', slug: 'googlecalendar' },
    description: canWrite
      ? 'View and manage Google Calendar events, including creating, updating, and deleting events.'
      : 'View Google Calendar events and inspect upcoming meetings without write access.',
    instructions: [
      EXACT_TOOL_NAME_INSTRUCTION,
      'Calendar tools default to the primary calendar. Use calendarId parameter for other calendars.',
      'Time parameters use ISO 8601 format (e.g., "2025-06-15T10:00:00Z").',
      'Always pass the user\'s local IANA timezone (e.g. "America/New_York") so that "today" and time ranges are anchored to their local time, not UTC.',
      'The calendar_list tool defaults to showing upcoming events from now.',
      canWrite
        ? 'You have write access. Use calendar_create to schedule new events, calendar_update to modify existing events, and calendar_delete to remove them. Pass addMeet: true to automatically attach a Google Meet link.'
        : 'You have read-only access. Creating, updating, and deleting events is not available.',
    ].join('\n'),
    tools: () => summarizeTools(createCalendarTools(SUMMARY_RESOLVER, canWrite)),
    activate: (resolveClient) => createCalendarTools(resolveClient, canWrite),
  };
}

function createDocsToolset(scopes: string[], capabilities: string[]): GoogleToolsetDefinition {
  const canWrite =
    hasWriteAccess(scopes, 'docs') && hasCapability(capabilities, GOOGLE_CAPABILITY_DOCS_WRITE);

  return {
    id: 'google-docs',
    name: 'Google Docs',
    icon: { type: 'simpleIcons', slug: 'googledocs' },
    description: canWrite
      ? 'Search, read, create, and update Google Docs documents for structured notes, drafts, and collaborative writing.'
      : 'Search and read Google Docs documents without write access.',
    instructions: [
      EXACT_TOOL_NAME_INSTRUCTION,
      'Google Docs search accepts optional Drive query filters (for example: "name contains \'Roadmap\'").',
      'docs_read returns flattened plain text extracted from the document body.',
      canWrite
        ? 'You have write access. Use docs_create to create docs, docs_update to append or replace content, and docs_edit for targeted text replacement.'
        : 'You have read-only access. Creating and updating docs is not available.',
    ].join('\n'),
    tools: () => summarizeTools(createDocsTools(SUMMARY_RESOLVER, canWrite)),
    activate: (resolveClient) => createDocsTools(resolveClient, canWrite),
  };
}

/**
 * Build the list of Google toolset definitions based on the granted scopes.
 * Only services that the user has authorized will be included.
 */
export function buildGoogleToolsets(
  input: string[] | BuildGoogleToolsetsInput,
): GoogleToolsetDefinition[] {
  const normalizedInput: BuildGoogleToolsetsInput = Array.isArray(input)
    ? { scopes: input }
    : input;
  const scopes = normalizedInput.scopes;
  const capabilities = normalizedInput.capabilities ?? [...GOOGLE_DEFAULT_CAPABILITIES];
  const tempPath = normalizedInput.tempPath;
  const toolsets: GoogleToolsetDefinition[] = [];

  if (
    hasServiceAccess(scopes, 'gmail') &&
    hasCapability(capabilities, GOOGLE_CAPABILITY_GMAIL_READ)
  ) {
    toolsets.push(createGmailToolset(scopes, capabilities, { tempPath }));
  }

  if (
    hasServiceAccess(scopes, 'drive') &&
    hasCapability(capabilities, GOOGLE_CAPABILITY_DRIVE_READ)
  ) {
    toolsets.push(createDriveToolset(scopes, capabilities));
  }

  if (
    hasServiceAccess(scopes, 'calendar') &&
    hasCapability(capabilities, GOOGLE_CAPABILITY_CALENDAR_READ)
  ) {
    toolsets.push(createCalendarToolset(scopes, capabilities));
  }

  if (
    hasServiceAccess(scopes, 'docs') &&
    hasCapability(capabilities, GOOGLE_CAPABILITY_DOCS_READ)
  ) {
    toolsets.push(createDocsToolset(scopes, capabilities));
  }

  return toolsets;
}
