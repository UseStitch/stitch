import { tool, type Tool } from 'ai';
import { z } from 'zod';

import * as DriveApi from './api.js';

import type { GoogleClient } from '../client.js';

const driveSearchSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  query: z.string().describe('Google Drive search query'),
  maxResults: z.number().optional().default(10).describe('Max results to return (default 10)'),
  pageToken: z.string().optional().describe('Pagination token from a previous search'),
});

const driveFileSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  fileId: z.string().describe('The Google Drive file ID'),
});

const driveWriteSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  name: z.string().describe('File name including extension (e.g. "notes.txt", "report.md")'),
  content: z.string().describe('Plain text content to write to the file'),
  mimeType: z
    .string()
    .optional()
    .default('text/plain')
    .describe(
      'MIME type of the file (default: text/plain). Use "text/markdown" for Markdown files.',
    ),
  parentId: z
    .string()
    .optional()
    .describe('Optional parent folder ID to place the file in. Defaults to Drive root.'),
});

export function createDriveTools(
  resolveClient: (
    account?: string,
  ) => Promise<{ client: GoogleClient; usedAccount: string | null }>,
  hasWrite = false,
): Record<string, Tool> {
  const tools: Record<string, Tool> = {
    drive_search: tool({
      description:
        'Search Google Drive files. Uses Drive query syntax (e.g. "name contains \'report\'", "mimeType=\'application/pdf\'", "modifiedTime > \'2024-01-01\'"). Returns file metadata.',
      inputSchema: driveSearchSchema,
      execute: async (input: z.infer<typeof driveSearchSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await DriveApi.searchFiles(
          client,
          input.query,
          input.maxResults,
          input.pageToken,
        );
        return { ...result, usedAccount };
      },
    }),
    drive_read: tool({
      description:
        'Read the content of a Google Drive file by ID. Google Docs are exported as plain text, Sheets as CSV, other files downloaded directly. Best for text-based files.',
      inputSchema: driveFileSchema,
      execute: async (input: z.infer<typeof driveFileSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await DriveApi.getFileContent(client, input.fileId);
        return { ...result, usedAccount };
      },
    }),
    drive_info: tool({
      description: 'Get metadata for a Google Drive file (name, type, size, dates, link, owners).',
      inputSchema: driveFileSchema,
      execute: async (input: z.infer<typeof driveFileSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await DriveApi.getFileMetadata(client, input.fileId);
        return { ...result, usedAccount };
      },
    }),
  };

  if (hasWrite) {
    tools['drive_write'] = tool({
      description:
        'Create a new text file in Google Drive with the given content. Supports plain text and Markdown.',
      inputSchema: driveWriteSchema,
      execute: async (input: z.infer<typeof driveWriteSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await DriveApi.createFile(
          client,
          input.name,
          input.content,
          input.mimeType,
          input.parentId,
        );
        return { ...result, usedAccount };
      },
    });
  }

  return tools;
}

export const DRIVE_TOOL_SUMMARIES = [
  { name: 'drive_search', description: 'Search Google Drive files using Drive query syntax' },
  {
    name: 'drive_read',
    description: 'Read file content from Google Drive (Docs as text, Sheets as CSV)',
  },
  { name: 'drive_info', description: 'Get metadata for a Google Drive file (including owners)' },
  {
    name: 'drive_write',
    description: 'Create a new text or Markdown file in Google Drive (requires write access)',
  },
];
