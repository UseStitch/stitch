import { and, eq, sql } from 'drizzle-orm';

import type { StoredPart } from '@stitch/shared/chat/messages';
import { createMessageId, createPartId } from '@stitch/shared/id';

import { saveTitleMessage } from '@/chat/message-store.js';
import { getDb } from '@/db/client.js';
import { recordingAnalyses } from '@/db/schema/recordings.js';
import { sessions } from '@/db/schema/sessions.js';
import type { TitleGenerationLlmUsageMetadata } from '@/db/schema/usage.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { generateTitleFromContent } from '@/title-generation/generator.js';
import { recordLlmUsage } from '@/usage/ledger.js';
import type { LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'title-generation-adapter' });

type TitleGenerationAdapterDeps = {
  generateTitle?: typeof generateTitleFromContent;
  recordTitleUsage?: typeof recordTitleUsage;
};

async function recordTitleUsage(input: {
  providerId: string;
  modelId: string;
  usage: LanguageModelUsage | null;
  metadata: TitleGenerationLlmUsageMetadata;
}): Promise<{ costUsd: number }> {
  const now = Date.now();

  return recordLlmUsage({
    source: 'title_generation',
    status: 'succeeded',
    providerId: input.providerId,
    modelId: input.modelId,
    usage: input.usage,
    metadata: input.metadata,
    startedAt: now,
    endedAt: now,
    durationMs: 0,
  });
}

export function registerTitleGenerationAdapter(deps: TitleGenerationAdapterDeps = {}): void {
  const generateTitle = deps.generateTitle ?? generateTitleFromContent;
  const recordUsage = deps.recordTitleUsage ?? recordTitleUsage;

  internalBus.on('title.generation.chat.requested', async (event) => {
    try {
      const generatedTitle = await generateTitle(event.content, event.fallbackProviderId, event.fallbackModelId);
      if (!generatedTitle) return;

      const db = getDb();
      const now = Date.now();
      const titleMessageId = createMessageId();
      const titlePart: StoredPart = {
        type: 'session-title',
        id: createPartId(),
        title: generatedTitle.title,
        startedAt: now,
        endedAt: now,
      };

      const { costUsd } = await recordUsage({
        providerId: generatedTitle.providerId,
        modelId: generatedTitle.modelId,
        usage: generatedTitle.usage,
        metadata: { source: 'title_generation', target: 'chat', sessionId: event.sessionId, messageId: titleMessageId },
      });

      await saveTitleMessage({
        sessionId: event.sessionId,
        messageId: titleMessageId,
        modelId: generatedTitle.modelId,
        providerId: generatedTitle.providerId,
        parts: [titlePart],
        usage: generatedTitle.usage ?? undefined,
        costUsd,
        createdAt: now,
      });

      await db
        .update(sessions)
        .set({ title: generatedTitle.title, updatedAt: Date.now() })
        .where(eq(sessions.id, event.sessionId));

      internalBus.emit('session.title.updated', { sessionId: event.sessionId, title: generatedTitle.title });
    } catch (error) {
      log.error({ sessionId: event.sessionId, error }, 'chat title generation failed');
    }
  });

  internalBus.on('title.generation.recording_analysis.requested', async (event) => {
    try {
      const generatedTitle = await generateTitle(event.content, event.fallbackProviderId, event.fallbackModelId);
      if (!generatedTitle) return;

      const { costUsd } = await recordUsage({
        providerId: generatedTitle.providerId,
        modelId: generatedTitle.modelId,
        usage: generatedTitle.usage,
        metadata: {
          source: 'title_generation',
          target: 'recording-analysis',
          recordingId: event.recordingId,
          analysisId: event.analysisId,
        },
      });

      const db = getDb();
      const [updated] = await db
        .update(recordingAnalyses)
        .set({
          title: generatedTitle.title,
          costUsd: sql`${recordingAnalyses.costUsd} + ${costUsd}`,
          updatedAt: Date.now(),
        })
        .where(and(eq(recordingAnalyses.id, event.analysisId), eq(recordingAnalyses.recordingId, event.recordingId)))
        .returning({ id: recordingAnalyses.id });
      if (!updated) return;

      internalBus.emit('recording.analysis.updated', {
        recordingId: event.recordingId,
        status: 'completed',
        title: generatedTitle.title,
      });
    } catch (error) {
      log.error(
        { recordingId: event.recordingId, analysisId: event.analysisId, error },
        'recording title generation failed',
      );
    }
  });
}
