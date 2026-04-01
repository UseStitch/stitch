import { tool, type Tool } from 'ai';
import { z } from 'zod';

import * as GmailApi from './api.js';

import type { GoogleClient } from '../client.js';

const gmailSearchSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  query: z.string().describe('Gmail search query (same syntax as Gmail search bar)'),
  maxResults: z.number().optional().default(10).describe('Max results to return (default 10)'),
  pageToken: z.string().optional().describe('Pagination token from a previous search'),
});

const gmailReadSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  messageId: z.string().describe('The Gmail message ID to read'),
});

const gmailSendSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  to: z.string().describe('Recipient email address'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Plain text email body'),
  from: z
    .string()
    .optional()
    .describe(
      'Sender address — use when the account has multiple aliases and you need to send from a specific one',
    ),
  cc: z.string().optional().describe('CC recipient(s)'),
  bcc: z.string().optional().describe('BCC recipient(s)'),
  inReplyTo: z
    .string()
    .optional()
    .describe(
      'Message-ID header of the message being replied to — read the original message first to get this value',
    ),
  threadId: z.string().optional().describe('Gmail thread ID to reply within'),
});

export function createGmailTools(
  resolveClient: (
    account?: string,
  ) => Promise<{ client: GoogleClient; usedAccount: string | null }>,
  hasWrite: boolean,
) {
  const tools: Record<string, Tool> = {
    gmail_search: tool({
      description:
        'Search Gmail messages using Gmail search syntax (e.g. "from:user@example.com", "subject:meeting", "is:unread", "newer_than:7d"). Returns message summaries.',
      inputSchema: gmailSearchSchema,
      execute: async (input: z.infer<typeof gmailSearchSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.searchMessages(
          client,
          input.query,
          input.maxResults,
          input.pageToken,
        );
        return { ...result, usedAccount };
      },
    }),
    gmail_read: tool({
      description:
        'Read the full content of a specific Gmail message by its ID. Returns headers, body text, and labels.',
      inputSchema: gmailReadSchema,
      execute: async (input: z.infer<typeof gmailReadSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.getMessage(client, input.messageId);
        return { ...result, usedAccount };
      },
    }),
  };

  if (hasWrite) {
    tools['gmail_send'] = tool({
      description:
        'Send an email via Gmail. Can also reply to an existing thread by providing inReplyTo and threadId.',
      inputSchema: gmailSendSchema,
      execute: async (input: z.infer<typeof gmailSendSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.sendMessage(client, input.to, input.subject, input.body, {
          from: input.from,
          cc: input.cc,
          bcc: input.bcc,
          inReplyTo: input.inReplyTo,
          threadId: input.threadId,
        });
        return { ...result, usedAccount };
      },
    });
  }

  return tools;
}

export const GMAIL_TOOL_SUMMARIES = [
  { name: 'gmail_search', description: 'Search Gmail messages using Gmail search syntax' },
  { name: 'gmail_read', description: 'Read the full content of a Gmail message by ID' },
  { name: 'gmail_send', description: 'Send an email or reply to a thread (requires write access)' },
];
