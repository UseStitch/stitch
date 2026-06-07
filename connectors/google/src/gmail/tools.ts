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
  idsOnly: z
    .boolean()
    .optional()
    .default(true)
    .describe('When true (default), returns only message IDs without fetching metadata'),
});

const gmailReadSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  messageId: z.string().describe('The Gmail message ID to read'),
});

const gmailDownloadAttachmentsSchema = z.object({
  account: z
    .string()
    .optional()
    .describe('Optional account email or label when multiple Google accounts are connected'),
  messageId: z.string().describe('The Gmail message ID whose attachments should be downloaded'),
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

const gmailFiltersSchema = z.discriminatedUnion('operation', [
  z.object({
    account: z
      .string()
      .optional()
      .describe('Optional account email or label when multiple Google accounts are connected'),
    operation: z.literal('list'),
  }),
  z.object({
    account: z
      .string()
      .optional()
      .describe('Optional account email or label when multiple Google accounts are connected'),
    operation: z.literal('get'),
    filterId: z.string().describe('Server-assigned filter ID'),
  }),
  z.object({
    account: z
      .string()
      .optional()
      .describe('Optional account email or label when multiple Google accounts are connected'),
    operation: z.literal('create'),
    criteria: z
      .object({
        from: z.string().optional().describe("Filter messages from this sender's email or name"),
        to: z
          .string()
          .optional()
          .describe("Filter messages to this recipient's email or name (includes cc/bcc)"),
        subject: z
          .string()
          .optional()
          .describe('Filter messages containing this phrase in the subject (case-insensitive)'),
        query: z
          .string()
          .optional()
          .describe('Filter using Gmail advanced search syntax (e.g. "is:unread has:attachment")'),
        negatedQuery: z
          .string()
          .optional()
          .describe('Exclude messages matching this Gmail search query'),
        hasAttachment: z.boolean().optional().describe('Only match messages with attachments'),
        excludeChats: z.boolean().optional().describe('Exclude chat messages from matching'),
        size: z.number().int().optional().describe('Message size threshold in bytes'),
        sizeComparison: z
          .enum(['smaller', 'larger'])
          .optional()
          .describe('Whether to match messages smaller or larger than the size threshold'),
      })
      .optional()
      .describe('Criteria that incoming messages must meet for the filter to fire'),
    action: z
      .object({
        addLabelIds: z
          .array(z.string())
          .optional()
          .describe(
            'Label IDs to add. System labels: INBOX, UNREAD, SPAM, TRASH, IMPORTANT, STARRED. Pass a user label ID to tag the message.',
          ),
        removeLabelIds: z
          .array(z.string())
          .optional()
          .describe(
            'Label IDs to remove. Common: INBOX (archive/skip inbox), UNREAD (mark read), SPAM (never spam), IMPORTANT (never mark important).',
          ),
        forward: z
          .string()
          .optional()
          .describe('Forward matching messages to this verified email address'),
      })
      .optional()
      .describe('Actions to apply to messages that match the criteria'),
  }),
  z.object({
    account: z
      .string()
      .optional()
      .describe('Optional account email or label when multiple Google accounts are connected'),
    operation: z.literal('delete'),
    filterId: z.string().describe('Server-assigned filter ID to permanently delete'),
  }),
]);

export function createGmailTools(
  resolveClient: (
    account?: string,
  ) => Promise<{ client: GoogleClient; usedAccount: string | null }>,
  permissions: { canSend: boolean; canModify: boolean; canManageFilters: boolean },
  config?: { tempPath?: string },
): Record<string, Tool> {
  const { canSend, canModify, canManageFilters } = permissions;
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
          input.idsOnly,
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
    gmail_download_attachments: tool({
      description:
        'Download all attachments from a Gmail message by ID to a temporary local folder. Returns file paths for downloaded attachments.',
      inputSchema: gmailDownloadAttachmentsSchema,
      execute: async (input: z.infer<typeof gmailDownloadAttachmentsSchema>) => {
        if (!config?.tempPath) {
          throw new Error('Gmail attachment downloads require a configured temp path.');
        }

        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.downloadAttachments(client, input.messageId, config.tempPath);
        return { ...result, usedAccount };
      },
    }),
    gmail_list_labels: tool({
      description:
        'List Gmail labels with visibility and message/thread counts. Use this to discover exact label IDs before calling gmail_get_label or gmail_modify_messages.',
      inputSchema: gmailListLabelsSchema,
      execute: async (input: z.infer<typeof gmailListLabelsSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.listLabels(client);
        return { ...result, usedAccount };
      },
    }),
    gmail_get_label: tool({
      description: 'Get details for one Gmail label by label ID, such as INBOX or a user label ID.',
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
    tools['gmail_modify_labels'] = tool({
      description:
        'Create, update, or delete Gmail labels. Always include operation with one of: create, update, delete.',
      inputSchema: gmailModifyLabelsSchema,
      execute: async (input: z.infer<typeof gmailModifyLabelsSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await GmailApi.modifyLabels(client, input);
        return { ...result, usedAccount };
      },
    });

    tools['gmail_modify_messages'] = tool({
      description:
        'Add or remove Gmail labels on messages, or on threads when modifyThreads=true. Provide at least one of addLabelIds or removeLabelIds. Do not add SPAM and TRASH in the same call.',
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

  if (canManageFilters) {
    tools['gmail_filters'] = tool({
      description:
        'Manage Gmail filters that automatically label, archive, delete, or forward incoming messages. Always include operation with one of: list, get, create, delete. Note: the Gmail API has no update endpoint, so to modify a filter you must delete it and recreate it.',
      inputSchema: gmailFiltersSchema,
      execute: async (input: z.infer<typeof gmailFiltersSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);

        if (input.operation === 'list') {
          const result = await GmailApi.listFilters(client);
          return { ...result, usedAccount };
        }

        if (input.operation === 'get') {
          const result = await GmailApi.getFilter(client, input.filterId);
          return { ...result, usedAccount };
        }

        if (input.operation === 'create') {
          const result = await GmailApi.createFilter(client, {
            criteria: input.criteria,
            action: input.action,
          });
          return { ...result, usedAccount };
        }

        // delete
        const result = await GmailApi.deleteFilter(client, input.filterId);
        return { ...result, usedAccount };
      },
    });
  }

  return tools;
}
