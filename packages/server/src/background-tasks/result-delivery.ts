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
import { getProviderCredentials } from '@/provider/config/service.js';
import { isLlmProviderCredentials, ProviderCredentialsSchema } from '@/provider/config/schema.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';

const log = Log.create({ service: 'background-task-result-delivery' });

export type ResultDeliveryDependencies = {
  claim: typeof claimPendingBackgroundTasks;
  markDelivered: typeof markBackgroundTaskClaimsDelivered;
  release: typeof releaseBackgroundTaskClaims;
  loadCredentials: (providerId: string, modelId: string) => Promise<LlmProviderCredentials>;
  insertMessage: (input: {
    messageId: PrefixedString<'msg'>;
    parentSessionId: PrefixedString<'ses'>;
    providerId: string;
    modelId: string;
    parts: StoredPart[];
  }) => Promise<void>;
  buildHistory: typeof buildSessionLlmMessages;
  run: typeof runStream;
  enqueue: typeof enqueueSessionRun;
  createMessageId: typeof createMessageId;
  createPartId: typeof createPartId;
};

async function loadCredentials(providerId: string, modelId: string): Promise<LlmProviderCredentials> {
  const validation = await validateProviderModel(providerId, modelId);
  if (validation.error) throw new Error(validation.error.message);

  const result = await getProviderCredentials(providerId);
  const parsed = ProviderCredentialsSchema.safeParse(result.data);
  if (result.error || !parsed.success || !isLlmProviderCredentials(parsed.data) || parsed.data.providerId !== providerId) {
    throw new Error(result.error?.message ?? `Provider "${providerId}" is not configured for LLM usage`);
  }
  return parsed.data;
}

async function insertMessage(input: Parameters<ResultDeliveryDependencies['insertMessage']>[0]): Promise<void> {
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

const defaultDependencies: ResultDeliveryDependencies = {
  claim: claimPendingBackgroundTasks,
  markDelivered: markBackgroundTaskClaimsDelivered,
  release: releaseBackgroundTaskClaims,
  loadCredentials,
  insertMessage,
  buildHistory: buildSessionLlmMessages,
  run: runStream,
  enqueue: enqueueSessionRun,
  createMessageId,
  createPartId,
};

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

export function scheduleBackgroundTaskResult(
  parentSessionId: PrefixedString<'ses'>,
  dependencies: ResultDeliveryDependencies = defaultDependencies,
): void {
  const deliveryMessageId = dependencies.createMessageId();
  const wakeUpMessageId = dependencies.createMessageId();

  const delivery = dependencies.enqueue(parentSessionId, async (abortSignal) => {
    const claimed = await dependencies.claim(parentSessionId, deliveryMessageId);
    if (claimed.length === 0) return;

    let inserted = false;
    try {
      const { providerId, modelId } = claimed[0];
      const credentials = await dependencies.loadCredentials(providerId, modelId);
      const now = Date.now();
      await dependencies.insertMessage({
        messageId: deliveryMessageId,
        parentSessionId,
        providerId,
        modelId,
        parts: [taskResultPart(claimed, dependencies.createPartId(), now)],
      });
      inserted = true;
      await dependencies.markDelivered(deliveryMessageId);

      const llmMessages = await dependencies.buildHistory(parentSessionId, {
        useBasePrompt: true,
        systemPrompt: null,
      });
      await dependencies.run({
        sessionId: parentSessionId,
        assistantMessageId: wakeUpMessageId,
        modelId,
        llmMessages,
        credentials,
        abortSignal,
      });
    } catch (error) {
      if (!inserted) await dependencies.release(deliveryMessageId);
      throw error;
    }
  });

  void delivery.catch((error) => {
    log.error({ event: 'background_task.delivery.failed', parentSessionId, error }, 'result delivery failed');
  });
}
