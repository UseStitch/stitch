import { and, desc, eq, inArray } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';

type SearchRoleFilter = 'user' | 'assistant' | 'all';

type SearchSessionHistoryInput = {
  query?: string;
  limit: number;
  roleFilter: SearchRoleFilter;
  includeCurrentSession: boolean;
  currentSessionId: PrefixedString<'ses'>;
};

type SessionSearchHit = {
  sessionId: PrefixedString<'ses'>;
  title: string | null;
  type: 'chat' | 'automation';
  updatedAt: number;
  createdAt: number;
  score: number;
  preview: string;
  matchCount: number;
};

type SessionMessageView = {
  messageId: PrefixedString<'msg'>;
  role: 'user' | 'assistant';
  createdAt: number;
  text: string;
  toolResults: Array<{
    toolName: string;
    output: string;
  }>;
};

const MAX_SESSIONS_TO_SCAN = 120;
const MAX_MESSAGES_PER_SESSION = 80;
const MAX_PREVIEW_CHARS = 260;
const MAX_TOOL_RESULT_PREVIEW_CHARS = 280;

function normalizeText(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

function toSearchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function extractMessageText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return '';
  }

  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      continue;
    }

    const typed = part as { type?: unknown; text?: unknown };
    if (typed.type === 'text-delta' && typeof typed.text === 'string') {
      chunks.push(typed.text);
    }
  }

  return normalizeText(chunks.join(''));
}

function extractToolResultPreviews(parts: unknown): Array<{ toolName: string; output: string }> {
  if (!Array.isArray(parts)) {
    return [];
  }

  const rows: Array<{ toolName: string; output: string }> = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      continue;
    }

    const typed = part as { type?: unknown; toolName?: unknown; output?: unknown };
    if (typed.type !== 'tool-result' || typeof typed.toolName !== 'string') {
      continue;
    }

    const outputText =
      typeof typed.output === 'string' ? typed.output : JSON.stringify(typed.output ?? null);
    rows.push({
      toolName: typed.toolName,
      output: normalizeText(outputText).slice(0, MAX_TOOL_RESULT_PREVIEW_CHARS),
    });
  }

  return rows;
}

function scoreText(text: string, queryLower: string, tokens: string[]): number {
  if (!text) {
    return 0;
  }

  const haystack = text.toLowerCase();
  let score = 0;

  if (queryLower.length > 0 && haystack.includes(queryLower)) {
    score += 6;
  }

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function buildPreview(text: string, queryLower: string): string {
  if (!text) {
    return '';
  }

  if (!queryLower) {
    return text.slice(0, MAX_PREVIEW_CHARS);
  }

  const lower = text.toLowerCase();
  const matchIndex = lower.indexOf(queryLower);
  if (matchIndex < 0) {
    return text.slice(0, MAX_PREVIEW_CHARS);
  }

  const start = Math.max(0, matchIndex - 80);
  return text.slice(start, start + MAX_PREVIEW_CHARS);
}

export async function searchSessionHistory(
  input: SearchSessionHistoryInput,
): Promise<{ hits: SessionSearchHit[]; scannedSessions: number }> {
  const db = getDb();

  const rawSessions = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.updatedAt))
    .limit(MAX_SESSIONS_TO_SCAN);

  const sessionRows = rawSessions.filter((row) =>
    input.includeCurrentSession ? true : row.id !== input.currentSessionId,
  );

  if (sessionRows.length === 0) {
    return { hits: [], scannedSessions: 0 };
  }

  const sessionIds = sessionRows.map((row) => row.id);
  const roleCondition =
    input.roleFilter === 'all'
      ? undefined
      : eq(messages.role, input.roleFilter === 'user' ? 'user' : 'assistant');

  const messageRows = await db
    .select({
      id: messages.id,
      sessionId: messages.sessionId,
      role: messages.role,
      parts: messages.parts,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      roleCondition
        ? and(inArray(messages.sessionId, sessionIds), roleCondition)
        : inArray(messages.sessionId, sessionIds),
    )
    .orderBy(desc(messages.createdAt));

  const messagesBySession = new Map<PrefixedString<'ses'>, typeof messageRows>();
  for (const row of messageRows) {
    const existing = messagesBySession.get(row.sessionId) ?? [];
    if (existing.length < MAX_MESSAGES_PER_SESSION) {
      existing.push(row);
      messagesBySession.set(row.sessionId, existing);
    }
  }

  const query = normalizeText(input.query ?? '');
  const queryLower = query.toLowerCase();
  const queryTokens = toSearchTokens(query);

  const now = Date.now();
  const hits: SessionSearchHit[] = [];

  for (const sessionRow of sessionRows) {
    const sessionMessages = messagesBySession.get(sessionRow.id) ?? [];
    if (sessionMessages.length === 0) {
      continue;
    }

    if (!query) {
      const firstText = extractMessageText(sessionMessages[0]?.parts);
      hits.push({
        sessionId: sessionRow.id,
        title: sessionRow.title,
        type: sessionRow.type,
        updatedAt: sessionRow.updatedAt,
        createdAt: sessionRow.createdAt,
        score: 0,
        preview: firstText.slice(0, MAX_PREVIEW_CHARS),
        matchCount: 0,
      });
      continue;
    }

    let bestScore = 0;
    let bestPreview = '';
    let matchCount = 0;

    for (const msg of sessionMessages) {
      const text = extractMessageText(msg.parts);
      const score = scoreText(text, queryLower, queryTokens);
      if (score <= 0) {
        continue;
      }

      matchCount += 1;
      if (score > bestScore) {
        bestScore = score;
        bestPreview = buildPreview(text, queryLower);
      }
    }

    if (matchCount === 0) {
      continue;
    }

    const ageDays = Math.max(0, (now - sessionRow.updatedAt) / (1000 * 60 * 60 * 24));
    const recencyBoost = Math.max(0, 2 - ageDays / 14);

    hits.push({
      sessionId: sessionRow.id,
      title: sessionRow.title,
      type: sessionRow.type,
      updatedAt: sessionRow.updatedAt,
      createdAt: sessionRow.createdAt,
      score: bestScore + recencyBoost,
      preview: bestPreview,
      matchCount,
    });
  }

  const sorted = hits
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, input.limit);

  return {
    hits: sorted,
    scannedSessions: sessionRows.length,
  };
}

export async function getSessionHistoryMessages(input: {
  sessionId: PrefixedString<'ses'>;
  limit: number;
  includeToolResults: boolean;
}): Promise<{ title: string | null; messages: SessionMessageView[] } | null> {
  const db = getDb();

  const [session] = await db
    .select({ id: sessions.id, title: sessions.title })
    .from(sessions)
    .where(eq(sessions.id, input.sessionId));

  if (!session) {
    return null;
  }

  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      parts: messages.parts,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(eq(messages.sessionId, input.sessionId), inArray(messages.role, ['user', 'assistant'])),
    )
    .orderBy(desc(messages.createdAt))
    .limit(input.limit);

  const normalized = rows
    .map((row) => ({
      messageId: row.id,
      role: row.role as 'user' | 'assistant',
      createdAt: row.createdAt,
      text: extractMessageText(row.parts),
      toolResults: input.includeToolResults ? extractToolResultPreviews(row.parts) : [],
    }))
    .reverse();

  return {
    title: session.title,
    messages: normalized,
  };
}
