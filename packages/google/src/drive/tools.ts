import { tool, type Tool } from 'ai';
import { z } from 'zod';

import type { GoogleClient } from '../client.js';
import * as DriveApi from './api.js';

const driveSearchSchema = z.object({
  query: z.string().describe('Google Drive search query'),
  maxResults: z.number().optional().default(10).describe('Max results to return (default 10)'),
  pageToken: z.string().optional().describe('Pagination token from a previous search'),
});

const driveFileSchema = z.object({
  fileId: z.string().describe('The Google Drive file ID'),
});

export function createDriveTools(client: GoogleClient): Record<string, Tool> {
  return {
    drive_search: tool({
      description:
        'Search Google Drive files. Uses Drive query syntax (e.g. "name contains \'report\'", "mimeType=\'application/pdf\'", "modifiedTime > \'2024-01-01\'"). Returns file metadata.',
      inputSchema: driveSearchSchema,
      execute: async (input: z.infer<typeof driveSearchSchema>) => {
        return DriveApi.searchFiles(client, input.query, input.maxResults, input.pageToken);
      },
    }),
    drive_read: tool({
      description:
        'Read the content of a Google Drive file by ID. Google Docs are exported as plain text, Sheets as CSV, other files downloaded directly. Best for text-based files.',
      inputSchema: driveFileSchema,
      execute: async (input: z.infer<typeof driveFileSchema>) => {
        return DriveApi.getFileContent(client, input.fileId);
      },
    }),
    drive_info: tool({
      description: 'Get metadata for a Google Drive file (name, type, size, dates, link).',
      inputSchema: driveFileSchema,
      execute: async (input: z.infer<typeof driveFileSchema>) => {
        return DriveApi.getFileMetadata(client, input.fileId);
      },
    }),
  };
}

export const DRIVE_TOOL_SUMMARIES = [
  { name: 'drive_search', description: 'Search Google Drive files using Drive query syntax' },
  { name: 'drive_read', description: 'Read file content from Google Drive (Docs as text, Sheets as CSV)' },
  { name: 'drive_info', description: 'Get metadata for a Google Drive file' },
];
