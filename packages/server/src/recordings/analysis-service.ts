import { Output, generateText } from 'ai';
import { and, eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

import { createRecordingAnalysisId, type PrefixedString } from '@stitch/shared/id';
import type {
  RecordingActionItem,
  RecordingAnalysis,
  RecordingAnalysisTopicSection,
  RecordingBlocker,
  RecordingAnalysisResponse,
  RecordingTranscriptEntry,
  StartRecordingAnalysisResponse,
} from '@stitch/shared/recordings/types';

import { getDb } from '@/db/client.js';
import { recordingAnalyses, recordings } from '@/db/schema/recordings.js';
import * as Events from '@/lib/events.js';
import * as Log from '@/lib/log.js';
import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';
import { err, isServiceError, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { createProvider } from '@/llm/provider/provider.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { resolveModel } from '@/llm/resolve-model.js';
import { recordLlmUsage } from '@/usage/ledger.js';
import { ZERO_USAGE } from '@/utils/usage.js';

const log = Log.create({ service: 'recordings-analysis' });
const NOT_SPECIFIED_TEXT = 'not specified';

const ANALYSIS_PROMPT_TEMPLATE = readFileSync(
  resolveRuntimeAssetPath(
    new URL('../meeting/analysis-system-prompt.md', import.meta.url),
    'meeting/analysis-system-prompt.md',
  ),
  'utf8',
).trim();

const actionItemSchema = z.object({
  task: z.string().min(1),
  dueDate: z.string().min(1).nullable(),
  topicName: z.string().min(1).nullable(),
});

const blockerSchema = z.object({
  description: z.string().min(1),
  impact: z.string().min(1).nullable(),
  topicName: z.string().min(1).nullable(),
});

const topicSectionSchema = z.object({
  name: z.string().min(1),
  analysis: z.string().min(1),
  decisions: z.array(z.string().min(1)).default([]),
  actionItems: z.array(actionItemSchema).default([]),
  blockers: z.array(blockerSchema).default([]),
  openQuestions: z.array(z.string().min(1)).default([]),
  nextSteps: z.array(z.string().min(1)).default([]),
});

const analysisOutputSchema = z.object({
  title: z.string().max(60),
  summary: z.string(),
  topicSections: z.array(topicSectionSchema).default([]),
});

type ActiveRun = {
  controller: AbortController;
  preserveExistingUntilComplete: boolean;
};

const activeRuns = new Map<PrefixedString<'recan'>, ActiveRun>();

function buildAnalysisPrompt(): string {
  return ANALYSIS_PROMPT_TEMPLATE.replaceAll(
    '{{CURRENT_DATE}}',
    new Date().toISOString().slice(0, 10),
  );
}

function formatTranscriptForAnalysis(entries: RecordingTranscriptEntry[]): string {
  return entries.map((entry, index) => `[${index}] ${entry.speaker}: ${entry.content}`).join('\n');
}

function normalizeNullableText(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.toLowerCase() === NOT_SPECIFIED_TEXT) return null;
  return normalized;
}

function normalizeActionItem(
  item: RecordingActionItem,
  topicName: string | null,
): RecordingActionItem {
  const task = item.task.trim();

  return {
    task,
    dueDate: normalizeNullableText(item.dueDate),
    topicName: normalizeNullableText(item.topicName) ?? normalizeNullableText(topicName),
  };
}

function normalizeBlocker(blocker: RecordingBlocker, topicName: string | null): RecordingBlocker {
  return {
    description: blocker.description.trim(),
    impact: normalizeNullableText(blocker.impact),
    topicName: normalizeNullableText(blocker.topicName) ?? normalizeNullableText(topicName),
  };
}

function normalizeTopicSections(
  sections: RecordingAnalysisTopicSection[],
): RecordingAnalysisTopicSection[] {
  return sections.map((section) => ({
    ...section,
    actionItems: section.actionItems.map((item) => normalizeActionItem(item, section.name)),
    blockers: section.blockers.map((blocker) => normalizeBlocker(blocker, section.name)),
  }));
}

function toResponse(
  row: typeof recordingAnalyses.$inferSelect,
  fallbackRecordingId: PrefixedString<'rec'>,
): RecordingAnalysis {
  return {
    recordingId: row.recordingId ?? fallbackRecordingId,
    status: row.status,
    transcript: row.transcript ?? [],
    topicSections: row.topicSections ?? [],
    summary: row.summary,
    title: row.title,
    error: row.error,
    transcriptionProviderId: row.transcriptionProviderId,
    transcriptionModelId: row.transcriptionModelId,
    analysisProviderId: row.analysisProviderId,
    analysisModelId: row.analysisModelId,
    costUsd: row.costUsd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
  };
}

function broadcastRecordingAnalysisUpdated(input: {
  recordingId: PrefixedString<'rec'>;
  status: RecordingAnalysis['status'];
  title: string | null;
}): void {
  Events.emit('recording-analysis-updated', {
    recordingId: input.recordingId,
    status: input.status,
    title: input.title,
  });
}

export async function getRecordingAnalysis(
  recordingId: PrefixedString<'rec'>,
): Promise<ServiceResult<RecordingAnalysisResponse>> {
  const db = getDb();

  const [recording] = await db
    .select({ id: recordings.id })
    .from(recordings)
    .where(eq(recordings.id, recordingId));
  if (!recording) {
    return err('Recording not found', 404);
  }

  const [analysis] = await db
    .select()
    .from(recordingAnalyses)
    .where(eq(recordingAnalyses.recordingId, recordingId));

  return ok({ analysis: analysis ? toResponse(analysis, recordingId) : null });
}

export async function startRecordingAnalysis(
  recordingId: PrefixedString<'rec'>,
  input?: { force?: boolean },
): Promise<ServiceResult<StartRecordingAnalysisResponse>> {
  const db = getDb();

  const [recording] = await db.select().from(recordings).where(eq(recordings.id, recordingId));
  if (!recording) {
    return err('Recording not found', 404);
  }
  if (recording.status !== 'completed') {
    return err('Recording must be completed before analysis', 400);
  }

  const [existing] = await db
    .select()
    .from(recordingAnalyses)
    .where(eq(recordingAnalyses.recordingId, recordingId));

  if (existing && existing.status !== 'failed' && existing.status !== 'pending' && !input?.force) {
    return ok({ analysis: toResponse(existing, recordingId) });
  }

  const transcript: RecordingTranscriptEntry[] = existing?.transcript ?? [];
  if (transcript.length === 0) {
    return err('No transcript available for this recording', 400);
  }

  const analysisModel = await resolveModel({
    providerIdKey: 'recordings.analysis.providerId',
    modelIdKey: 'recordings.analysis.modelId',
  });

  if (isServiceError(analysisModel)) {
    return analysisModel;
  }

  const now = Date.now();
  const id = existing?.id ?? createRecordingAnalysisId();
  const preserveExistingUntilComplete = existing?.status === 'completed' && input?.force === true;

  activeRuns.get(id)?.controller.abort();

  if (!preserveExistingUntilComplete) {
    await db
      .insert(recordingAnalyses)
      .values({
        id,
        recordingId,
        status: 'pending',
        transcript,
        topicSections: [],
        summary: '',
        title: '',
        error: null,
        transcriptionProviderId: existing?.transcriptionProviderId ?? null,
        transcriptionModelId: existing?.transcriptionModelId ?? null,
        analysisProviderId: analysisModel.data.providerId,
        analysisModelId: analysisModel.data.modelId,
        usage: ZERO_USAGE,
        costUsd: existing?.costUsd ?? 0,
        startedAt: null,
        endedAt: null,
        durationMs: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: recordingAnalyses.recordingId,
        set: {
          id,
          status: 'pending',
          transcript,
          topicSections: [],
          summary: '',
          title: '',
          error: null,
          transcriptionProviderId: existing?.transcriptionProviderId ?? null,
          transcriptionModelId: existing?.transcriptionModelId ?? null,
          analysisProviderId: analysisModel.data.providerId,
          analysisModelId: analysisModel.data.modelId,
          usage: ZERO_USAGE,
          startedAt: null,
          endedAt: null,
          durationMs: null,
          updatedAt: now,
        },
      });
  }

  broadcastRecordingAnalysisUpdated({
    recordingId,
    status: 'pending',
    title: null,
  });

  void runRecordingAnalysis(id, {
    recordingId,
    transcript,
    analysisProviderId: analysisModel.data.providerId,
    analysisModelId: analysisModel.data.modelId,
    analysisCredentials: analysisModel.data.credentials,
    preserveExistingUntilComplete,
  });

  const [created] = await db.select().from(recordingAnalyses).where(eq(recordingAnalyses.id, id));
  if (!created) {
    return err('Failed to create recording analysis', 400);
  }

  return ok({ analysis: toResponse(created, recordingId) });
}

export async function cancelRecordingAnalysis(
  recordingId: PrefixedString<'rec'>,
): Promise<ServiceResult<null>> {
  const db = getDb();

  const [recording] = await db
    .select({ id: recordings.id })
    .from(recordings)
    .where(eq(recordings.id, recordingId));
  if (!recording) {
    return err('Recording not found', 404);
  }

  const [existing] = await db
    .select()
    .from(recordingAnalyses)
    .where(eq(recordingAnalyses.recordingId, recordingId));
  if (!existing) {
    return err('Recording analysis not found', 404);
  }

  const activeRun = activeRuns.get(existing.id);
  if (!activeRun && existing.status !== 'processing') {
    return err('Recording analysis is not running', 400);
  }

  activeRuns.delete(existing.id);
  activeRun?.controller.abort();

  if (activeRun?.preserveExistingUntilComplete) {
    broadcastRecordingAnalysisUpdated({
      recordingId,
      status: existing.status,
      title: existing.title || null,
    });

    return ok(null);
  }

  const endedAt = Date.now();
  const [updated] = await db
    .update(recordingAnalyses)
    .set({
      status: 'failed',
      error: null,
      endedAt,
      durationMs: existing.startedAt ? endedAt - existing.startedAt : null,
      updatedAt: endedAt,
    })
    .where(eq(recordingAnalyses.id, existing.id))
    .returning();

  broadcastRecordingAnalysisUpdated({
    recordingId,
    status: 'failed',
    title: null,
  });

  if (!updated) {
    return err('Failed to cancel recording analysis', 400);
  }

  return ok(null);
}

async function runRecordingAnalysis(
  analysisId: PrefixedString<'recan'>,
  input: {
    recordingId: PrefixedString<'rec'>;
    transcript: RecordingTranscriptEntry[];
    analysisProviderId: string;
    analysisModelId: string;
    analysisCredentials: ProviderCredentials;
    preserveExistingUntilComplete: boolean;
  },
): Promise<void> {
  const db = getDb();
  const startedAt = Date.now();
  const abortController = new AbortController();
  activeRuns.set(analysisId, {
    controller: abortController,
    preserveExistingUntilComplete: input.preserveExistingUntilComplete,
  });

  try {
    if (!input.preserveExistingUntilComplete) {
      await db
        .update(recordingAnalyses)
        .set({
          status: 'processing',
          startedAt,
          endedAt: null,
          durationMs: null,
          updatedAt: Date.now(),
        })
        .where(
          and(
            eq(recordingAnalyses.id, analysisId),
            eq(recordingAnalyses.recordingId, input.recordingId),
          ),
        );
    }

    broadcastRecordingAnalysisUpdated({
      recordingId: input.recordingId,
      status: 'processing',
      title: null,
    });

    const analysisModel = createProvider(input.analysisCredentials)(input.analysisModelId);
    const analysisRunId = `${analysisId}:analysis`;
    const analysisStart = Date.now();
    const analysisResult = await generateText({
      model: analysisModel,
      output: Output.object({ schema: analysisOutputSchema }),
      system: buildAnalysisPrompt(),
      messages: [
        {
          role: 'user',
          content: `Analyze this transcript.\n\n${formatTranscriptForAnalysis(input.transcript)}`,
        },
      ],
      abortSignal: abortController.signal,
    });

    const analysisOutput = analysisResult.output;
    if (!analysisOutput) {
      throw new Error('Analysis did not return a structured output');
    }

    const analysisUsage = analysisResult.usage ?? ZERO_USAGE;

    const { costUsd: analysisCost } = await recordLlmUsage({
      runId: analysisRunId,
      source: 'recording_analysis',
      providerId: input.analysisProviderId,
      modelId: input.analysisModelId,
      usage: analysisUsage,
      metadata: {
        recordingId: input.recordingId,
        analysisId,
        phase: 'analysis',
      },
      startedAt: analysisStart,
      endedAt: Date.now(),
      durationMs: Date.now() - analysisStart,
    });

    const endedAt = Date.now();
    const topicSections = normalizeTopicSections(analysisOutput.topicSections);

    if (activeRuns.get(analysisId)?.controller !== abortController) {
      return;
    }

    // Read existing transcription cost so we can add analysis cost on top
    const [currentRow] = await db
      .select({ costUsd: recordingAnalyses.costUsd })
      .from(recordingAnalyses)
      .where(eq(recordingAnalyses.id, analysisId));
    const transcriptionCost = currentRow?.costUsd ?? 0;

    await db
      .update(recordingAnalyses)
      .set({
        status: 'completed',
        transcript: input.transcript,
        topicSections,
        title: analysisOutput.title,
        summary: analysisOutput.summary,
        error: null,
        analysisProviderId: input.analysisProviderId,
        analysisModelId: input.analysisModelId,
        usage: analysisUsage,
        costUsd: transcriptionCost + analysisCost,
        startedAt,
        endedAt,
        durationMs: endedAt - startedAt,
        updatedAt: endedAt,
      })
      .where(eq(recordingAnalyses.id, analysisId));

    broadcastRecordingAnalysisUpdated({
      recordingId: input.recordingId,
      status: 'completed',
      title: analysisOutput.title,
    });

    log.info({ analysisId, recordingId: input.recordingId }, 'recording analysis completed');
  } catch (error) {
    if (activeRuns.get(analysisId)?.controller !== abortController) {
      return;
    }

    const message = error instanceof Error ? error.message : 'Failed to analyze recording';

    if (input.preserveExistingUntilComplete) {
      log.error(
        { analysisId, recordingId: input.recordingId, error: message },
        'recording analysis rerun failed',
      );
      return;
    }

    const endedAt = Date.now();

    await db
      .update(recordingAnalyses)
      .set({
        status: 'failed',
        error: message,
        endedAt,
        durationMs: endedAt - startedAt,
        updatedAt: endedAt,
      })
      .where(eq(recordingAnalyses.id, analysisId));

    broadcastRecordingAnalysisUpdated({
      recordingId: input.recordingId,
      status: 'failed',
      title: null,
    });

    log.error(
      { analysisId, recordingId: input.recordingId, error: message },
      'recording analysis failed',
    );
  } finally {
    if (activeRuns.get(analysisId)?.controller === abortController) {
      activeRuns.delete(analysisId);
    }
  }
}
