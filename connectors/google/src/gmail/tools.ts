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

const gmailListLabelsSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
});

const gmailGetLabelsSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  labelId: z.string().describe('Gmail label ID (for example: INBOX or a user label ID)'),
});

const gmailModifyLabelsSchema = z.discriminatedUnion('operation', [
  z.object({
    account: z
      .string()
      .optional()
      .describe('Optional account email or label when multiple Google accounts are connected'),
    operation: z.literal('create'),
    name: z.string().describe('Name for the new Gmail label'),
    messageListVisibility: z
      .enum(['show', 'hide'])
      .optional()
      .describe('Whether messages with this label are shown in message list'),
    labelListVisibility: z
      .enum(['labelShow', 'labelShowIfUnread', 'labelHide'])
      .optional()
      .describe('Whether this label appears in the label list'),
  }),
  z.object({
    account: z
      .string()
      .optional()
      .describe('Optional account email or label when multiple Google accounts are connected'),
    operation: z.literal('update'),
    labelId: z.string().describe('Label ID to update'),
    name: z.string().optional().describe('Updated label name'),
    messageListVisibility: z
      .enum(['show', 'hide'])
      .optional()
      .describe('Updated message list visibility'),
    labelListVisibility: z
      .enum(['labelShow', 'labelShowIfUnread', 'labelHide'])
      .optional()
      .describe('Updated label list visibility'),
  }),
  z.object({
    account: z
      .string()
      .optional()
      .describe('Optional account email or label when multiple Google accounts are connected'),
    operation: z.literal('delete'),
    labelId: z.string().describe('Label ID to delete'),
  }),
]);

const gmailModifyMessagesSchema = z
  .object({
    account: z
      .string()
      .optional()
      .describe('Optional account email or label when multiple Google accounts are connected'),
    messageIds: z
      .array(z.string())
      .min(1)
      .describe('Message IDs by default. If modifyThreads=true, provide thread IDs instead.'),
    addLabelIds: z
      .array(z.string())
      .optional()
      .describe('Label IDs to add (for example: ["UNREAD", "Label_123"])'),
    removeLabelIds: z.array(z.string()).optional().describe('Label IDs to remove'),
    modifyThreads: z
      .boolean()
      .optional()
      .default(false)
      .describe('Set true to apply label changes to a thread instead of a single message'),
  })
  .refine(
    (value) => (value.addLabelIds?.length ?? 0) > 0 || (value.removeLabelIds?.length ?? 0) > 0,
    {
      message: 'Provide at least one label in addLabelIds or removeLabelIds',
      path: ['addLabelIds'],
    },
  );

export function createGmailTools(
  resolveClient: (
    account?: string,
  ) => Promise<{ client: GoogleClient; usedAccount: string | null }>,
  permissions: { canSend: boolean; canModify: boolean },
) {
  const { canSend, canModify } = permissions;
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
    listLabels: tool({
      description: 'List Gmail labels with visibility and message/thread counts.',
      inputSchema: gmailListLabelsSchema,
      execute: async (input: z.infer<typeof gmailListLabelsSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.listLabels(client);
        return { ...result, usedAccount };
      },
    }),
    getLabels: tool({
      description: 'Get details for one Gmail label by label ID.',
      inputSchema: gmailGetLabelsSchema,
      execute: async (input: z.infer<typeof gmailGetLabelsSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.getLabels(client, input.labelId);
        return { ...result, usedAccount };
      },
    }),
  };

  if (canSend) {
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

  if (canModify) {
    tools['modifyLabels'] = tool({
      description:
        'Create, update, or delete Gmail labels using operation enum values: create, update, delete.',
      inputSchema: gmailModifyLabelsSchema,
      execute: async (input: z.infer<typeof gmailModifyLabelsSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.modifyLabels(client, input);
        return { ...result, usedAccount };
      },
    });

    tools['modifyMessages'] = tool({
      description:
        'Add/remove Gmail labels on messages, or on threads when modifyThreads=true.',
      inputSchema: gmailModifyMessagesSchema,
      execute: async (input: z.infer<typeof gmailModifyMessagesSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.modifyMessages(client, {
          messageIds: input.messageIds,
          addLabelIds: input.addLabelIds,
          removeLabelIds: input.removeLabelIds,
          modifyThreads: input.modifyThreads,
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
  { name: 'listLabels', description: 'List Gmail labels with metadata and visibility settings' },
  { name: 'getLabels', description: 'Get details for a single Gmail label by ID' },
  {
    name: 'modifyLabels',
    description: 'Create, update, or delete Gmail labels using an operation enum',
  },
  {
    name: 'modifyMessages',
    description: 'Add or remove labels on messages (or threads with modifyThreads=true)',
  },
];
