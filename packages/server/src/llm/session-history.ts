import { and, asc, eq, isNull } from 'drizzle-orm';

import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { buildHistoryMessages } from '@/llm/history-messages.js';
import { getPromptUserContext } from '@/llm/prompt/builder.js';
import type { PromptConfig } from '@/llm/prompt/builder.js';
import { retrieveMemoryContext } from '@/memory/retriever.js';
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

  const [msgs, promptUserContext, promptSettings, sessionRow, todoContext] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), isNull(messages.archivedAt)))
      .orderBy(asc(messages.createdAt)),
    getPromptUserContext(),
    getSettings(['agents.customInstructions'] as const),
    db.select({ type: sessions.type }).from(sessions).where(eq(sessions.id, sessionId)).limit(1),
    getSessionTodosPromptBlock(sessionId),
  ]);

  // Automations can read all memories; chat only sees 'chat' memories.
  const memorySourceFilter = sessionRow[0]?.type === 'automation' ? undefined : ('chat' as const);

  let startIndex = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].isSummary) {
      startIndex = i;
      break;
    }
  }

  let memoryContext: string | null = null;
  const latestUserMsg = [...msgs].reverse().find((m) => m.role === 'user');
  if (latestUserMsg) {
    const userText = latestUserMsg.parts
      .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
      .map((p) => p.text)
      .join('');

    if (userText.length > 0) {
      memoryContext = await retrieveMemoryContext(userText, memorySourceFilter).catch(() => null);
    }
  }

  return buildHistoryMessages(msgs.slice(startIndex), {
    useBasePrompt: promptConfig.useBasePrompt,
    systemPrompt: promptConfig.systemPrompt ?? promptSettings['agents.customInstructions'],
    userName: promptUserContext.userName,
    userTimezone: promptUserContext.userTimezone,
    memoryContext,
    todoContext,
  });
}
