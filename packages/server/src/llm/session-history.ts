import { and, asc, eq, isNull } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema/sessions.js';
import { buildHistoryMessages } from '@/llm/history-messages.js';
import { getPromptUserContext } from '@/llm/prompt/builder.js';
import type { PromptConfig } from '@/llm/prompt/builder.js';
import { readMemoryPromptContext } from '@/memory/snapshot.js';
import { getSettings } from '@/settings/service.js';
import { getSessionTodosPromptBlock } from '@/todos/service.js';
import type { ModelMessage } from 'ai';

/**
 * Build the LLM message history for a session, starting from the latest summary boundary.
 */
export async function buildSessionLlmMessages(
  sessionId: PrefixedString<'ses'>,
  promptConfig: Pick<PromptConfig, 'useBasePrompt' | 'systemPrompt'>,
): Promise<ModelMessage[]> {
  const db = getDb();

  const [msgs, promptUserContext, promptSettings, todoContext, memoryContext] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), isNull(messages.archivedAt)))
      .orderBy(asc(messages.createdAt)),
    getPromptUserContext(),
    getSettings(['agents.customInstructions'] as const),
    getSessionTodosPromptBlock(sessionId),
    readMemoryPromptContext(),
  ]);

  const startIndex = Math.max(
    0,
    msgs.findLastIndex((message) => message.isSummary),
  );

  return buildHistoryMessages(msgs.slice(startIndex), {
    useBasePrompt: promptConfig.useBasePrompt,
    systemPrompt: promptConfig.systemPrompt ?? promptSettings['agents.customInstructions'],
    userName: promptUserContext.userName,
    userTimezone: promptUserContext.userTimezone,
    memoryContext,
    todoContext,
  });
}
