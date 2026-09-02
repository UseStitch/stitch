import type { BackgroundTask } from '@stitch/shared/background-tasks/types';
import type { BackgroundTaskResultPart, StoredPart } from '@stitch/shared/chat/messages';
import { createMessageId, createPartId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import {
  claimPendingBackgroundTasks,
  markBackgroundTaskClaimsDelivered,
  releaseBackgroundTaskClaims,
} from '@/background-tasks/repository.js';
import { getDb } from '@/db/client.js';
import { messages } from '@/db/schema/sessions.js';
import * as Log from '@/lib/log.js';
import { validateProviderModel } from '@/llm/resolve-model.js';
import { buildSessionLlmMessages } from '@/llm/session-history.js';
import { runStream } from '@/llm/stream/runner.js';
import { enqueueSessionRun } from '@/llm/stream/session-run-coordinator.js';
import { getProviderCredentials, isLlmProviderCredentials, type LlmProviderCredentials } from '@/provider/service.js';

const log = Log.create({ service: 'background-task-result-delivery' });

async function loadCredentials(providerId: string, modelId: string): Promise<LlmProviderCredentials> {
  await validateProviderModel(providerId, modelId);

  const creds = await getProviderCredentials(providerId);
  if (!isLlmProviderCredentials(creds) || creds.providerId !== providerId) {
    throw new Error(`Provider "${providerId}" is not configured for LLM usage`);
  }
  return creds;
}

async function insertMessage(input: {
  messageId: PrefixedString<'msg'>;
  parentSessionId: PrefixedString<'ses'>;
  providerId: string;
  modelId: string;
  parts: StoredPart[];
}): Promise<void> {
  const now = Date.now();
  await getDb()
    .insert(messages)
    .values({
      id: input.messageId,
      sessionId: input.parentSessionId,
      role: 'user',
      parts: input.parts,
      modelId: input.modelId,
      providerId: input.providerId,
      costUsd: 0,
      finishReason: 'stop',
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      duration: 0,
    })
    .onConflictDoNothing();
}

function taskResultPart(tasks: BackgroundTask[], partId: PrefixedString<'prt'>, now: number): StoredPart {
  const part: BackgroundTaskResultPart = {
    type: 'background-task-result',
    tasks: tasks.map((task) => ({
      taskId: task.id,
      childSessionId: task.childSessionId,
      title: task.title,
      state: task.status === 'completed' ? 'completed' : 'error',
      text: task.status === 'completed' ? (task.result ?? '') : (task.error ?? 'Unknown error'),
    })),
  };
  return { ...part, id: partId, startedAt: now, endedAt: now };
}

export function scheduleBackgroundTaskResult(parentSessionId: PrefixedString<'ses'>): void {
  const deliveryMessageId = createMessageId();
  const wakeUpMessageId = createMessageId();

  const delivery = enqueueSessionRun(parentSessionId, async (abortSignal) => {
    const claimed = await claimPendingBackgroundTasks(parentSessionId, deliveryMessageId);
    if (claimed.length === 0) return;

    let inserted = false;
    try {
      const { providerId, modelId } = claimed[0];
      const credentials = await loadCredentials(providerId, modelId);
      const now = Date.now();
      await insertMessage({
        messageId: deliveryMessageId,
        parentSessionId,
        providerId,
        modelId,
        parts: [taskResultPart(claimed, createPartId(), now)],
      });
      inserted = true;
      await markBackgroundTaskClaimsDelivered(deliveryMessageId);

      const llmMessages = await buildSessionLlmMessages(parentSessionId, { useBasePrompt: true, systemPrompt: null });
      await runStream({
        sessionId: parentSessionId,
        assistantMessageId: wakeUpMessageId,
        modelId,
        llmMessages,
        credentials,
        abortSignal,
      });
    } catch (error) {
      if (!inserted) await releaseBackgroundTaskClaims(deliveryMessageId);
      throw error;
    }
  });

  void delivery.catch((error) => {
    log.error({ event: 'background_task.delivery.failed', parentSessionId, error }, 'result delivery failed');
  });
}
