import { tool, type Tool } from 'ai';
import { z } from 'zod';

import * as DocsApi from './api.js';

import type { GoogleClient } from '../client.js';

const docsSearchSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  query: z
    .string()
    .optional()
    .describe(
      'Optional Google Drive query fragment to filter results. Examples: "name contains \'Q1\'", "modifiedTime > \'2024-01-01\'", "\'me\' in owners", "sharedWithMe". Omit to list all Docs.',
    ),
  maxResults: z.number().optional().default(10).describe('Max results to return (default 10)'),
  pageToken: z.string().optional().describe('Pagination token from a previous search'),
});

const docsReadSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  documentId: z.string().describe('The Google Docs document ID'),
});

const docsCreateSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  title: z.string().describe('Title for the new Google Doc'),
  content: z.string().optional().describe('Optional initial plain text body content'),
});

const docsUpdateSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  documentId: z.string().describe('The Google Docs document ID'),
  content: z.string().describe('Plain text content to write to the document'),
  mode: z
    .enum(['replace', 'append'])
    .optional()
    .default('replace')
    .describe('Use "replace" to overwrite content or "append" to add at the end'),
});

export function createDocsTools(
  resolveClient: (
    account?: string,
  ) => Promise<{ client: GoogleClient; usedAccount: string | null }>,
  hasWrite: boolean,
): Record<string, Tool> {
  const tools: Record<string, Tool> = {
    docs_search: tool({
      description:
        'Search Google Docs files in Drive. Optionally provide a Drive query fragment like "name contains \'roadmap\'".',
      inputSchema: docsSearchSchema,
      execute: async (input: z.infer<typeof docsSearchSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await DocsApi.searchDocuments(
          client,
          input.query,
          input.maxResults,
          input.pageToken,
        );
        return { ...result, usedAccount };
      },
    }),
    docs_read: tool({
      description: 'Read a Google Docs document and return flattened plain text content.',
      inputSchema: docsReadSchema,
      execute: async (input: z.infer<typeof docsReadSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await DocsApi.readDocument(client, input.documentId);
        return { ...result, usedAccount };
      },
    }),
  };

  if (hasWrite) {
    tools['docs_create'] = tool({
      description: 'Create a new Google Docs document with an optional initial body.',
      inputSchema: docsCreateSchema,
      execute: async (input: z.infer<typeof docsCreateSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await DocsApi.createDocument(client, input.title, input.content);
        return { ...result, usedAccount };
      },
    });

    tools['docs_update'] = tool({
      description:
        'Update a Google Docs document with plain text. Supports replace (overwrite) or append mode.',
      inputSchema: docsUpdateSchema,
      execute: async (input: z.infer<typeof docsUpdateSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await DocsApi.updateDocument(
          client,
          input.documentId,
          input.content,
          input.mode,
        );
        return { ...result, usedAccount };
      },
    });
  }

  return tools;
}

export const DOCS_TOOL_SUMMARIES = [
  { name: 'docs_search', description: 'Search Google Docs files by Drive query filters' },
  { name: 'docs_read', description: 'Read a Google Docs document as plain text' },
  { name: 'docs_create', description: 'Create a Google Docs document (requires write access)' },
  { name: 'docs_update', description: 'Update a Google Docs document (requires write access)' },
];
