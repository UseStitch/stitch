import { describe, expect, test } from 'bun:test';
import type { ModelMessage } from 'ai';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { buildSessionLlmMessages } from '@/llm/session-history.js';

setupTestDb();

function textPart(text: string, time: number): StoredPart {
  return { type: 'text-delta', id: `prt_${time}`, text, startedAt: time, endedAt: time };
}

async function insertSession(id: string): Promise<void> {
  const now = Date.now();
  await getDb()
    .insert(sessions)
    .values({
      id: id as never,
      title: id,
      type: 'chat',
      automationId: null,
      parentSessionId: null,
      createdAt: now,
      updatedAt: now,
    });
}

async function insertMessage(
  sessionId: string,
  id: string,
  role: 'user' | 'assistant',
  text: string,
  time: number,
  isSummary = false,
): Promise<void> {
  await getDb()
    .insert(messages)
    .values({
      id: id as never,
      sessionId: sessionId as never,
      role,
      parts: [textPart(text, time)],
      modelId: 'test-model',
      providerId: 'test-provider',
      costUsd: 0,
      finishReason: role === 'assistant' ? 'stop' : null,
      isSummary,
      createdAt: time,
      updatedAt: time,
      startedAt: time,
      duration: role === 'assistant' ? 0 : null,
    });
}

function collectText(llmMessages: ModelMessage[]): string {
  let out = '';
  for (const message of llmMessages) {
    if (typeof message.content === 'string') {
      out += message.content;
    } else {
      for (const part of message.content) {
        if (part.type === 'text') {
          out += part.text;
        }
      }
    }
  }
  return out;
}

describe('buildSessionLlmMessages summary boundary', () => {
  test('keeps the whole conversation when no summary message exists', async () => {
    const sessionId = 'ses_history_no_summary';
    const now = Date.now();
    await insertSession(sessionId);
    await insertMessage(sessionId, 'msg_history_a', 'user', 'First question', now - 3);
    await insertMessage(sessionId, 'msg_history_b', 'assistant', 'First answer', now - 2);
    await insertMessage(sessionId, 'msg_history_c', 'user', 'Second question', now - 1);

    const llmMessages = await buildSessionLlmMessages(sessionId as never, {
      useBasePrompt: true,
      systemPrompt: null,
      systemPromptFromSettings: false,
      includeMemory: false,
      includeTodos: false,
    });

    const text = collectText(llmMessages);
    expect(text).toContain('First question');
    expect(text).toContain('Second question');
  });

  test('starts from the latest summary message and drops prior context', async () => {
    const sessionId = 'ses_history_with_summary';
    const now = Date.now();
    await insertSession(sessionId);
    await insertMessage(sessionId, 'msg_history_sum_old', 'user', 'Settled context', now - 3);
    await insertMessage(sessionId, 'msg_history_sum', 'assistant', 'Summary', now - 2, true);
    await insertMessage(sessionId, 'msg_history_live', 'user', 'Live question', now - 1);

    const llmMessages = await buildSessionLlmMessages(sessionId as never, {
      useBasePrompt: true,
      systemPrompt: null,
      systemPromptFromSettings: false,
      includeMemory: false,
      includeTodos: false,
    });

    const text = collectText(llmMessages);
    expect(text).toContain('Live question');
    expect(text).toContain('Summary');
    expect(text).not.toContain('Settled context');
  });
});