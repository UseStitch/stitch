import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';

import { Output, generateText } from 'ai';
import { and, eq, inArray } from 'drizzle-orm';
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
import { providerConfig, recordingAnalyses, recordings, userSettings } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';
import { err, isServiceError, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { createProvider } from '@/llm/provider/provider.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { listEnabledProviderAudioModels } from '@/llm/provider/service.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { recordUsageEvent } from '@/usage/ledger.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';
import { addUsage, ZERO_USAGE } from '@/utils/usage.js';

const log = Log.create({ service: 'recordings-analysis' });

const TRANSCRIPTION_PROMPT_TEMPLATE = readFileSync(
  resolveRuntimeAssetPath(
    new URL('../meeting/transcription-system-prompt.md', import.meta.url),
    'meeting/transcription-system-prompt.md',
  ),
  'utf8',
).trim();

const ANALYSIS_PROMPT_TEMPLATE = readFileSync(
  resolveRuntimeAssetPath(
    new URL('../meeting/analysis-system-prompt.md', import.meta.url),
    'meeting/analysis-system-prompt.md',
  ),
  'utf8',
).trim();

const transcriptEntrySchema = z.object({
  speaker: z.string().min(1),
  content: z.string().min(1),
});

const transcriptionOutputSchema = z.object({
  transcript: z.array(transcriptEntrySchema),
});

const topicSchema = z.object({
  name: z.string().min(1),
  startTurn: z.number().int().min(0),
  endTurn: z.number().int().min(0),
});

const actionItemSchema = z.object({
  task: z.string().min(1),
  assignee: z.string().min(1).nullable(),
  dueDate: z.string().min(1).nullable(),
  status: z.enum(['todo', 'in_progress', 'done', 'unknown']),
  topicName: z.string().min(1).nullable(),
});

const blockerSchema = z.object({
  description: z.string().min(1),
  assignee: z.string().min(1).nullable(),
  impact: z.string().min(1).nullable(),
  topicName: z.string().min(1).nullable(),
});

const topicSectionSchema = z.object({
  name: z.string().min(1),
  startTurn: z.number().int().min(0),
  endTurn: z.number().int().min(0),
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
  topics: z.array(topicSchema),
  topicSections: z.array(topicSectionSchema).default([]),
  actionItems: z.array(actionItemSchema).default([]),
  blockers: z.array(blockerSchema).default([]),
});

const activeRuns = new Map<PrefixedString<'recan'>, AbortController>();

function buildTranscriptionPrompt(localUserLabel: string): string {
  return TRANSCRIPTION_PROMPT_TEMPLATE.replaceAll(
    '{{CURRENT_DATE}}',
    new Date().toISOString().slice(0, 10),
  ).replaceAll('{{LOCAL_USER_LABEL}}', localUserLabel);
}

function buildAnalysisPrompt(): string {
  return ANALYSIS_PROMPT_TEMPLATE.replaceAll(
    '{{CURRENT_DATE}}',
    new Date().toISOString().slice(0, 10),
  );
}

function normalizeTranscript(entries: RecordingTranscriptEntry[]): RecordingTranscriptEntry[] {
  return entries
    .map((entry) => ({ speaker: entry.speaker.trim(), content: entry.content.trim() }))
    .filter((entry) => entry.speaker.length > 0 && entry.content.length > 0);
}

function formatTranscriptForAnalysis(entries: RecordingTranscriptEntry[]): string {
  return entries.map((entry, index) => `[${index}] ${entry.speaker}: ${entry.content}`).join('\n');
}

function normalizeNullableText(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.toLowerCase() === 'not specified') return null;
  return normalized;
}

function normalizeActionItem(item: RecordingActionItem, topicName: string | null): RecordingActionItem {
  const task = item.task.trim();
  const status = item.status;

  return {
    task,
    assignee: normalizeNullableText(item.assignee),
    dueDate: normalizeNullableText(item.dueDate),
    status,
    topicName: normalizeNullableText(item.topicName) ?? normalizeNullableText(topicName),
  };
}

function normalizeBlocker(blocker: RecordingBlocker, topicName: string | null): RecordingBlocker {
  return {
    description: blocker.description.trim(),
    assignee: normalizeNullableText(blocker.assignee),
    impact: normalizeNullableText(blocker.impact),
    topicName: normalizeNullableText(blocker.topicName) ?? normalizeNullableText(topicName),
  };
}

function normalizeTopicSections(sections: RecordingAnalysisTopicSection[]): RecordingAnalysisTopicSection[] {
  return sections
    .map((section) => {
      const normalizedTopicName = section.name.trim();
      return {
        ...section,
        name: normalizedTopicName,
        analysis: section.analysis.trim(),
        decisions: section.decisions.map((decision) => decision.trim()).filter(Boolean),
        actionItems: section.actionItems
          .map((item) => normalizeActionItem(item, normalizedTopicName))
          .filter((item) => item.task.length > 0),
        blockers: section.blockers
          .map((blocker) => normalizeBlocker(blocker, normalizedTopicName))
          .filter((blocker) => blocker.description.length > 0),
        openQuestions: section.openQuestions.map((question) => question.trim()).filter(Boolean),
        nextSteps: section.nextSteps.map((step) => step.trim()).filter(Boolean),
      };
    })
    .filter((section) => section.name.length > 0);
}

function toResponse(
  row: typeof recordingAnalyses.$inferSelect,
  fallbackRecordingId: PrefixedString<'rec'>,
): RecordingAnalysis {
  return {
    recordingId: row.recordingId ?? fallbackRecordingId,
    status: row.status,
    transcript: row.transcript ?? [],
    topics: row.topics ?? [],
    topicSections: row.topicSections ?? [],
    summary: row.summary,
    title: row.title,
    actionItems: row.actionItems ?? [],
    blockers: row.blockers ?? [],
    error: row.error,
    transcriptionProviderId: row.transcriptionProviderId,
    transcriptionModelId: row.transcriptionModelId,
    analysisProviderId: row.analysisProviderId,
    analysisModelId: row.analysisModelId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
  };
}

async function broadcastRecordingAnalysisUpdated(input: {
  recordingId: PrefixedString<'rec'>;
  status: RecordingAnalysis['status'];
  title: string | null;
}): Promise<void> {
  await Sse.broadcast('recording-analysis-updated', {
    recordingId: input.recordingId,
    status: input.status,
    title: input.title,
  });
}

async function resolveTranscriptionModel(): Promise<
  ServiceResult<{ providerId: string; modelId: string; credentials: ProviderCredentials }>
> {
  const db = getDb();
  const [settingsRows, configs, audioProviders] = await Promise.all([
    db
      .select({ key: userSettings.key, value: userSettings.value })
      .from(userSettings)
      .where(
        inArray(userSettings.key, [
          'recordings.transcription.providerId',
          'recordings.transcription.modelId',
        ]),
      ),
    db.select().from(providerConfig),
    listEnabledProviderAudioModels(),
  ]);

  const configuredProviderId = settingsRows.find(
    (row) => row.key === 'recordings.transcription.providerId',
  )?.value;
  const configuredModelId = settingsRows.find(
    (row) => row.key === 'recordings.transcription.modelId',
  )?.value;

  if (configuredProviderId && configuredModelId) {
    const hasModel = audioProviders.some(
      (provider) =>
        provider.providerId === configuredProviderId &&
        provider.models.some((model) => model.id === configuredModelId),
    );
    const config = configs.find((row) => row.providerId === configuredProviderId);
    if (hasModel && config) {
      return ok({
        providerId: configuredProviderId,
        modelId: configuredModelId,
        credentials: config.credentials,
      });
    }
  }

  const fallbackProvider = audioProviders[0];
  const fallbackModel = fallbackProvider?.models[0];
  if (!fallbackProvider || !fallbackModel) {
    return err('No enabled provider with audio-capable models found for transcription', 400);
  }

  const fallbackConfig = configs.find((row) => row.providerId === fallbackProvider.providerId);
  if (!fallbackConfig) {
    return err('No provider credentials found for transcription model', 400);
  }

  return ok({
    providerId: fallbackProvider.providerId,
    modelId: fallbackModel.id,
    credentials: fallbackConfig.credentials,
  });
}

async function resolveAnalysisModel(fallback: {
  providerId: string;
  modelId: string;
}): Promise<
  ServiceResult<{ providerId: string; modelId: string; credentials: ProviderCredentials }>
> {
  const db = getDb();
  const [settingsRows, configs] = await Promise.all([
    db
      .select({ key: userSettings.key, value: userSettings.value })
      .from(userSettings)
      .where(
        inArray(userSettings.key, ['recordings.analysis.providerId', 'recordings.analysis.modelId']),
      ),
    db.select().from(providerConfig),
  ]);

  const configuredProviderId = settingsRows.find((row) => row.key === 'recordings.analysis.providerId')
    ?.value;
  const configuredModelId = settingsRows.find((row) => row.key === 'recordings.analysis.modelId')
    ?.value;
  if (configuredProviderId && configuredModelId) {
    const config = configs.find((row) => row.providerId === configuredProviderId);
    if (!config) {
      return err('Configured analysis provider is not connected', 400);
    }

    return ok({
      providerId: configuredProviderId,
      modelId: configuredModelId,
      credentials: config.credentials,
    });
  }

  const resolved = await resolveCheapModel({
    providerIdKey: 'recordings.analysis.providerId',
    modelIdKey: 'recordings.analysis.modelId',
    fallbackProviderId: fallback.providerId,
    fallbackModelId: fallback.modelId,
  });
  if (!resolved) {
    return err('No model available for recording analysis', 400);
  }

  return ok({
    providerId: resolved.providerId,
    modelId: resolved.modelId,
    credentials: resolved.credentials,
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

  const [recording] = await db
    .select()
    .from(recordings)
    .where(eq(recordings.id, recordingId));
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

  if (existing && existing.status !== 'failed' && !input?.force) {
    return ok({ analysis: toResponse(existing, recordingId) });
  }

  const transcriptionModel = await resolveTranscriptionModel();
  if (isServiceError(transcriptionModel)) {
    return transcriptionModel;
  }

  const analysisModel = await resolveAnalysisModel({
    providerId: transcriptionModel.data.providerId,
    modelId: transcriptionModel.data.modelId,
  });
  if (isServiceError(analysisModel)) {
    return analysisModel;
  }

  const now = Date.now();
  const id = existing?.id ?? createRecordingAnalysisId();

  activeRuns.get(id)?.abort();

  await db
    .insert(recordingAnalyses)
    .values({
      id,
      recordingId,
      status: 'pending',
      transcript: [],
      topics: [],
      topicSections: [],
      summary: '',
      title: '',
      actionItems: [],
      blockers: [],
      error: null,
      transcriptionProviderId: transcriptionModel.data.providerId,
      transcriptionModelId: transcriptionModel.data.modelId,
      analysisProviderId: analysisModel.data.providerId,
      analysisModelId: analysisModel.data.modelId,
      usage: ZERO_USAGE,
      costUsd: 0,
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
        transcript: [],
        topics: [],
        topicSections: [],
        summary: '',
        title: '',
        actionItems: [],
        blockers: [],
        error: null,
        transcriptionProviderId: transcriptionModel.data.providerId,
        transcriptionModelId: transcriptionModel.data.modelId,
        analysisProviderId: analysisModel.data.providerId,
        analysisModelId: analysisModel.data.modelId,
        usage: ZERO_USAGE,
        costUsd: 0,
        startedAt: null,
        endedAt: null,
        durationMs: null,
        updatedAt: now,
      },
    });

  await broadcastRecordingAnalysisUpdated({
    recordingId,
    status: 'pending',
    title: null,
  });

  void runRecordingAnalysis(id, {
    recordingId,
    filePath: recording.filePath,
    transcriptionProviderId: transcriptionModel.data.providerId,
    transcriptionModelId: transcriptionModel.data.modelId,
    transcriptionCredentials: transcriptionModel.data.credentials,
    analysisProviderId: analysisModel.data.providerId,
    analysisModelId: analysisModel.data.modelId,
    analysisCredentials: analysisModel.data.credentials,
  });

  const [created] = await db
    .select()
    .from(recordingAnalyses)
    .where(eq(recordingAnalyses.id, id));
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

  if (existing.status !== 'pending' && existing.status !== 'processing') {
    return err('Recording analysis is not running', 400);
  }

  const controller = activeRuns.get(existing.id);
  activeRuns.delete(existing.id);
  controller?.abort();

  const endedAt = Date.now();
  const [updated] = await db
    .update(recordingAnalyses)
    .set({
      status: 'failed',
      error: 'Analysis cancelled by user',
      endedAt,
      durationMs: existing.startedAt ? endedAt - existing.startedAt : null,
      updatedAt: endedAt,
    })
    .where(eq(recordingAnalyses.id, existing.id))
    .returning();

  await broadcastRecordingAnalysisUpdated({
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
    filePath: string;
    transcriptionProviderId: string;
    transcriptionModelId: string;
    transcriptionCredentials: ProviderCredentials;
    analysisProviderId: string;
    analysisModelId: string;
    analysisCredentials: ProviderCredentials;
  },
): Promise<void> {
  const db = getDb();
  const startedAt = Date.now();
  const abortController = new AbortController();
  activeRuns.set(analysisId, abortController);

  try {
    await db
      .update(recordingAnalyses)
      .set({
        status: 'processing',
        startedAt,
        endedAt: null,
        durationMs: null,
        updatedAt: Date.now(),
      })
      .where(and(eq(recordingAnalyses.id, analysisId), eq(recordingAnalyses.recordingId, input.recordingId)));

    await broadcastRecordingAnalysisUpdated({
      recordingId: input.recordingId,
      status: 'processing',
      title: null,
    });

    const [profileRow, audioData] = await Promise.all([
      db
        .select({ value: userSettings.value })
        .from(userSettings)
        .where(eq(userSettings.key, 'profile.name'))
        .then((rows) => rows[0]),
      fs.readFile(input.filePath),
    ]);

    const localUserLabel = profileRow?.value.trim() || 'Local User';

    const transcriptionModel = createProvider(input.transcriptionCredentials)(input.transcriptionModelId);
    const transcriptionRunId = `${analysisId}:transcription`;
    const transcriptionStart = Date.now();
    const transcriptionResult = await generateText({
      model: transcriptionModel,
      output: Output.object({ schema: transcriptionOutputSchema }),
      system: buildTranscriptionPrompt(localUserLabel),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file', data: audioData, mediaType: 'audio/ogg' },
            { type: 'text', text: 'Please transcribe this recording.' },
          ],
        },
      ],
      abortSignal: abortController.signal,
    });

    const transcript = normalizeTranscript(transcriptionResult.output?.transcript ?? []);
    if (transcript.length === 0) {
      throw new Error('Transcription returned no speaker turns');
    }

    const transcriptionUsage = transcriptionResult.usage ?? ZERO_USAGE;

    const transcriptionCost = await calculateMessageCostUsd({
      providerId: input.transcriptionProviderId,
      modelId: input.transcriptionModelId,
      usage: transcriptionUsage,
    });

    await recordUsageEvent({
      runId: transcriptionRunId,
      source: 'transcription_recording',
      providerId: input.transcriptionProviderId,
      modelId: input.transcriptionModelId,
      usage: transcriptionUsage,
      costUsd: transcriptionCost,
      metadata: {
        recordingId: input.recordingId,
        analysisId,
        phase: 'transcription',
      },
      startedAt: transcriptionStart,
      endedAt: Date.now(),
      durationMs: Date.now() - transcriptionStart,
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
          content: `Analyze this transcript.\n\n${formatTranscriptForAnalysis(transcript)}`,
        },
      ],
      abortSignal: abortController.signal,
    });

    const analysisOutput = analysisResult.output;
    if (!analysisOutput) {
      throw new Error('Analysis did not return a structured output');
    }

    const analysisUsage = analysisResult.usage ?? ZERO_USAGE;

    const analysisCost = await calculateMessageCostUsd({
      providerId: input.analysisProviderId,
      modelId: input.analysisModelId,
      usage: analysisUsage,
    });

    await recordUsageEvent({
      runId: analysisRunId,
      source: 'recording_analysis',
      providerId: input.analysisProviderId,
      modelId: input.analysisModelId,
      usage: analysisUsage,
      costUsd: analysisCost,
      metadata: {
        recordingId: input.recordingId,
        analysisId,
        phase: 'analysis',
      },
      startedAt: analysisStart,
      endedAt: Date.now(),
      durationMs: Date.now() - analysisStart,
    });

    const totalUsage = addUsage(transcriptionUsage, analysisUsage);
    const endedAt = Date.now();
    const topicSections = normalizeTopicSections(analysisOutput.topicSections);
    const actionItems = analysisOutput.actionItems
      .map((item) => normalizeActionItem(item, null))
      .filter((item) => item.task.length > 0);
    const blockers = analysisOutput.blockers
      .map((blocker) => normalizeBlocker(blocker, null))
      .filter((blocker) => blocker.description.length > 0);
    const fallbackActionItems = topicSections.flatMap((section) => section.actionItems);
    const fallbackBlockers = topicSections.flatMap((section) => section.blockers);

    if (activeRuns.get(analysisId) !== abortController) {
      return;
    }

    await db
      .update(recordingAnalyses)
      .set({
        status: 'completed',
        transcript,
        topics: analysisOutput.topics,
        topicSections,
        title: analysisOutput.title,
        summary: analysisOutput.summary,
        actionItems: actionItems.length > 0 ? actionItems : fallbackActionItems,
        blockers: blockers.length > 0 ? blockers : fallbackBlockers,
        error: null,
        usage: totalUsage,
        costUsd: transcriptionCost + analysisCost,
        endedAt,
        durationMs: endedAt - startedAt,
        updatedAt: endedAt,
      })
      .where(eq(recordingAnalyses.id, analysisId));

    await broadcastRecordingAnalysisUpdated({
      recordingId: input.recordingId,
      status: 'completed',
      title: analysisOutput.title,
    });

    log.info({ analysisId, recordingId: input.recordingId }, 'recording analysis completed');
  } catch (error) {
    if (activeRuns.get(analysisId) !== abortController) {
      return;
    }

    const message = error instanceof Error ? error.message : 'Failed to analyze recording';
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

    await broadcastRecordingAnalysisUpdated({
      recordingId: input.recordingId,
      status: 'failed',
      title: null,
    });

    log.error({ analysisId, recordingId: input.recordingId, error: message }, 'recording analysis failed');
  } finally {
    if (activeRuns.get(analysisId) === abortController) {
      activeRuns.delete(analysisId);
    }
  }
}
