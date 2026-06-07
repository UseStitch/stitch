import { tool } from 'ai';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';

import { getSessionHistoryMessages, searchSessionHistory } from '@/chat/history-search-service.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import type { Toolset } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

const SESSION_HISTORY_TOOLSET_ID = 'session-history';

const TOOL_SUMMARIES = [
  {
    name: 'session_history_search',
    description: 'Search prior sessions by query with relevance-ranked snippets',
  },
  {
    name: 'session_history_get',
    description: 'Read a bounded slice of messages for one session',
  },
];

function createSessionHistoryTools(context: ToolContext): Record<string, Tool> {
  const session_history_search = tool({
    description: `Search chat history across past sessions.

Use this when the user asks what happened earlier, references past decisions, or needs prior context. Keep results focused: start with limit 3-5, then use session_history_get for deeper inspection.`,
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe('Natural language search query. Leave empty to list recent sessions.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum sessions to return (default 3, max 5).'),
      roleFilter: z
        .enum(['all', 'user', 'assistant'])
        .optional()
        .describe('Restrict matches to user or assistant messages.'),
      includeCurrentSession: z
        .boolean()
        .optional()
        .describe('Include the current session in search results (default false).'),
    }),
    execute: async (input) => {
      const result = await searchSessionHistory({
        query: input.query,
        limit: input.limit ?? 3,
        roleFilter: input.roleFilter ?? 'all',
        includeCurrentSession: input.includeCurrentSession ?? false,
        currentSessionId: context.sessionId,
      });

      return {
        query: input.query ?? null,
        scannedSessions: result.scannedSessions,
        totalMatches: result.hits.length,
        sessions: result.hits.map((hit) => ({
          sessionId: hit.sessionId,
          title: hit.title,
          type: hit.type,
          updatedAt: hit.updatedAt,
          createdAt: hit.createdAt,
          relevance: Number(hit.score.toFixed(2)),
          matchCount: hit.matchCount,
          preview: hit.preview,
        })),
      };
    },
  });

  const session_history_get = tool({
    description: `Read messages from one session using a bounded limit.

Use this after session_history_search to inspect a specific session without dumping excessive history.`,
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to inspect (e.g. ses_abc123).'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of recent messages to return (default 20).'),
      includeToolResults: z
        .boolean()
        .optional()
        .describe('Include compact previews of tool outputs (default false).'),
    }),
    execute: async (input) => {
      const result = await getSessionHistoryMessages({
        sessionId: input.sessionId as PrefixedString<'ses'>,
        limit: input.limit ?? 20,
        includeToolResults: input.includeToolResults ?? false,
      });

      if (!result) {
        return {
          sessionId: input.sessionId,
          found: false,
          message: 'Session not found.',
        };
      }

      return {
        sessionId: input.sessionId,
        found: true,
        title: result.title,
        messageCount: result.messages.length,
        messages: result.messages,
      };
    },
  });

  return {
    session_history_search,
    session_history_get,
  };
}

export function createSessionHistoryToolset(): Toolset {
  return {
    id: SESSION_HISTORY_TOOLSET_ID,
    name: 'Session History',
    description:
      'Search and inspect prior chat sessions with bounded, relevance-ranked results for cross-session recall.',
    instructions: [
      'Use session_history_search first, then session_history_get only for the specific session(s) you need.',
      'Prefer small limits (3-5 sessions, 20-30 messages) to avoid unnecessary context growth.',
      'Do not request includeToolResults unless tool output details are essential to answer the user.',
    ].join('\n'),
    tools: () => TOOL_SUMMARIES,
    activate: async (context: ToolContext) => {
      return createSessionHistoryTools(context);
    },
  };
}
