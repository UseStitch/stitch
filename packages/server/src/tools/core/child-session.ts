import { and, eq } from 'drizzle-orm';

import { extractTextFromParts, type StoredPart } from '@stitch/shared/chat/messages';
import { createMessageId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { LlmProviderId } from '@stitch/shared/providers/types';
import { toolError } from '@stitch/shared/tools/types';

import { createSession } from '@/chat/session-crud.js';
import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema/sessions.js';
import * as AbortRegistry from '@/lib/abort-registry.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { buildSessionLlmMessages } from '@/llm/session-history.js';
import { runStream } from '@/llm/stream/runner.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

const log = Log.create({ service: 'child-session' });

export type ChildSessionDeps = {
  parentSessionId: PrefixedString<'ses'>;
  parentAbortSignal: AbortSignal;
  credentials: LlmProviderCredentials;
  modelId: string;
  providerId: LlmProviderId;
};

export type ChildSessionOptions = {
  toolCallId?: string;
  toolName: string;
  title: string;
  parts: StoredPart[];
  toolsetIds?: string[];
  excludedToolsetIds?: string[];
};

export async function runChildSession(context: ToolContext, deps: ChildSessionDeps, options: ChildSessionOptions) {
  let childSession;
  try {
    childSession = await createSession({ title: options.title, parentSessionId: deps.parentSessionId });
  } catch (error) {
    const message = Error.isError(error) ? error.message : String(error);
    return toolError(`Failed to create child session: ${message}`);
  }
  const childSessionId = childSession.id;

  if (options.toolCallId) {
    internalBus.emit('tool.progress', {
      sessionId: context.sessionId,
      messageId: context.messageId,
      toolCallId: options.toolCallId,
      toolName: options.toolName,
      output: { childSessionId, childSessionName: childSession.title },
    });
  }

  log.info(
    { event: `${options.toolName}.child_session.created`, parentSessionId: deps.parentSessionId, childSessionId },
    `child session created for ${options.toolName}`,
  );

  const userMessageId = createMessageId();
  const now = Date.now();
  const db = getDb();
  await db
    .insert(messages)
    .values({
      id: userMessageId,
      sessionId: childSessionId,
      role: 'user',
      parts: options.parts,
      modelId: deps.modelId,
      providerId: deps.providerId,
      costUsd: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      duration: null,
    });

  const llmMessages = await buildSessionLlmMessages(childSessionId, { useBasePrompt: true, systemPrompt: null });
  const assistantMessageId = createMessageId();

  const childAbortSignal = AbortRegistry.register(childSessionId);
  const onParentAbort = () => {
    AbortRegistry.abort(childSessionId);
  };
  deps.parentAbortSignal.addEventListener('abort', onParentAbort, { once: true });

  try {
    await runStream({
      sessionId: childSessionId,
      assistantMessageId,
      modelId: deps.modelId,
      llmMessages,
      credentials: deps.credentials,
      abortSignal: childAbortSignal,
      activeToolsetIds: options.toolsetIds ?? [],
      allowTaskTool: false,
      excludedToolsetIds: options.excludedToolsetIds,
    });

    log.info(
      { event: `${options.toolName}.child_session.completed`, parentSessionId: deps.parentSessionId, childSessionId },
      `child session completed for ${options.toolName}`,
    );

    const childMessages = await db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, childSessionId), eq(messages.id, assistantMessageId)));

    const assistantMessage = childMessages.at(0);
    const summary = extractTextFromParts(assistantMessage?.parts) || 'Completed.';

    return { childSessionId, childSessionName: childSession.title, summary };
  } catch (error) {
    log.error(
      {
        event: `${options.toolName}.child_session.failed`,
        parentSessionId: deps.parentSessionId,
        childSessionId,
        error,
      },
      `child session failed for ${options.toolName}`,
    );

    return toolError(`Failed: ${Error.isError(error) ? error.message : 'Unknown error'}`, {
      childSessionId,
      childSessionName: childSession.title,
    });
  } finally {
    deps.parentAbortSignal.removeEventListener('abort', onParentAbort);
    AbortRegistry.cleanup(childSessionId);
  }
}
