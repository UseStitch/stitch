import { and, eq, sql } from 'drizzle-orm';

import type { StoredPart } from '@stitch/shared/chat/messages';
import { createMessageId, createPartId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

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

const log = Log.create({ service: 'title-generation' });

export function buildChatTitleContent(firstMessage: string, filenames: string[] = []): string {
  const normalizedFilenames = filenames.map((name) => name.trim()).filter(Boolean);
  const filenameContext =
    normalizedFilenames.length > 0
      ? `\nAttached filenames:\n${normalizedFilenames.map((name) => `- ${name}`).join('\n')}`
      : '';

  return `
Generate a short, descriptive title (30 chars max) for a conversation.
If attached filenames are provided, prefer using them when they add useful context.

First message:
"${firstMessage}"${filenameContext}

Return only the title.
`;
}

export function buildRecordingTitleContent(analysis: string): string {
  return `
Generate a short, descriptive title (60 chars max) for these meeting notes.
Use neutral language and do not invent details.

Meeting notes:
${analysis}

Return only the title.
`;
}

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

export async function applyChatTitle(input: {
  sessionId: PrefixedString<'ses'>;
  content: string;
  fallbackProviderId: string;
  fallbackModelId: string;
}): Promise<void> {
  try {
    const generatedTitle = await generateTitleFromContent(
      input.content,
      input.fallbackProviderId,
      input.fallbackModelId,
    );
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

    const { costUsd } = await recordTitleUsage({
      providerId: generatedTitle.providerId,
      modelId: generatedTitle.modelId,
      usage: generatedTitle.usage,
      metadata: { source: 'title_generation', target: 'chat', sessionId: input.sessionId, messageId: titleMessageId },
    });

    await saveTitleMessage({
      sessionId: input.sessionId,
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
      .where(eq(sessions.id, input.sessionId));

    internalBus.emit('session.title.updated', { sessionId: input.sessionId, title: generatedTitle.title });
  } catch (error) {
    log.error({ sessionId: input.sessionId, error }, 'chat title generation failed');
  }
}

export async function applyRecordingTitle(input: {
  recordingId: PrefixedString<'rec'>;
  analysisId: PrefixedString<'recan'>;
  content: string;
  fallbackProviderId: string;
  fallbackModelId: string;
}): Promise<void> {
  try {
    const generatedTitle = await generateTitleFromContent(
      input.content,
      input.fallbackProviderId,
      input.fallbackModelId,
    );
    if (!generatedTitle) return;

    const { costUsd } = await recordTitleUsage({
      providerId: generatedTitle.providerId,
      modelId: generatedTitle.modelId,
      usage: generatedTitle.usage,
      metadata: {
        source: 'title_generation',
        target: 'recording-analysis',
        recordingId: input.recordingId,
        analysisId: input.analysisId,
      },
    });

    const db = getDb();
    const updated = (
      await db
        .update(recordingAnalyses)
        .set({
          title: generatedTitle.title,
          costUsd: sql`${recordingAnalyses.costUsd} + ${costUsd}`,
          updatedAt: Date.now(),
        })
        .where(and(eq(recordingAnalyses.id, input.analysisId), eq(recordingAnalyses.recordingId, input.recordingId)))
        .returning({ id: recordingAnalyses.id })
    ).at(0);
    if (!updated) return;

    internalBus.emit('recording.analysis.updated', {
      recordingId: input.recordingId,
      status: 'completed',
      title: generatedTitle.title,
    });
  } catch (error) {
    log.error(
      { recordingId: input.recordingId, analysisId: input.analysisId, error },
      'recording title generation failed',
    );
  }
}
