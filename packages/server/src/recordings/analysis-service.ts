import { generateText } from 'ai';
import { and, eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';

import { createRecordingAnalysisId, type PrefixedString } from '@stitch/shared/id';
import type {
  RecordingAnalysis,
  RecordingAnalysisResponse,
  RecordingTranscriptEntry,
  StartRecordingAnalysisResponse,
} from '@stitch/shared/recordings/types';

import { getDb } from '@/db/client.js';
import { recordingAnalyses, recordings } from '@/db/schema/recordings.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { createProvider } from '@/llm/provider/provider.js';
import { resolveModel } from '@/llm/resolve-model.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';
import { RecordingAnalysisEmptyResponseError } from '@/recordings/errors.js';
import { readRecordingAnalysis, readRecordingTranscript, writeRecordingAnalysis } from '@/recordings/file-store.js';
import { getMeetingNoteTemplate } from '@/recordings/meeting-note-templates.js';
import { recordLlmUsage } from '@/usage/ledger.js';
import { ZERO_USAGE } from '@/utils/usage.js';
import type { LanguageModel } from 'ai';

const log = Log.create({ service: 'recordings-analysis' });

const ANALYSIS_PROMPT_TEMPLATE = readFileSync(
  resolveRuntimeAssetPath(
    new URL('../meeting/analysis-system-prompt.md', import.meta.url),
    'meeting/analysis-system-prompt.md',
  ),
  'utf8',
).trim();

type AnalysisDeps = {
  resolveModel: typeof resolveModel;
  createProvider: (credentials: LlmProviderCredentials) => (modelId: string) => LanguageModel;
};

const defaultDeps: AnalysisDeps = { resolveModel, createProvider };

type ActiveRun = { controller: AbortController; preserveExistingUntilComplete: boolean };

const activeRuns = new Map<PrefixedString<'recan'>, ActiveRun>();

function buildAnalysisPrompt(template: string): string {
  return ANALYSIS_PROMPT_TEMPLATE.replaceAll('{{CURRENT_DATE}}', new Date().toISOString().slice(0, 10)).replaceAll(
    '{{MEETING_NOTE_TEMPLATE}}',
    template,
  );
}

function formatTranscriptForAnalysis(entries: RecordingTranscriptEntry[]): string {
  return entries.map((entry, index) => `[${index}] ${entry.speaker}: ${entry.content}`).join('\n');
}

function buildRecordingTitleContent(analysis: string): string {
  return `
Generate a short, descriptive title (60 chars max) for these meeting notes.
Use neutral language and do not invent details.

Meeting notes:
${analysis}

Return only the title.
`;
}

export async function toRecordingAnalysis(row: typeof recordingAnalyses.$inferSelect): Promise<RecordingAnalysis> {
  return {
    recordingId: row.recordingId,
    status: row.status,
    transcript: await readRecordingTranscript(row.recordingId),
    summary: await readRecordingAnalysis(row.recordingId),
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
  internalBus.emit('recording.analysis.updated', {
    recordingId: input.recordingId,
    status: input.status,
    title: input.title,
  });
}

export async function getRecordingAnalysis(
  recordingId: PrefixedString<'rec'>,
): Promise<ServiceResult<RecordingAnalysisResponse>> {
  const db = getDb();

  const [recording] = await db.select({ id: recordings.id }).from(recordings).where(eq(recordings.id, recordingId));
  if (!recording) {
    return err('Recording not found', 404);
  }

  const [analysis] = await db.select().from(recordingAnalyses).where(eq(recordingAnalyses.recordingId, recordingId));

  return ok({ analysis: analysis ? await toRecordingAnalysis(analysis) : null });
}

export async function startRecordingAnalysis(
  recordingId: PrefixedString<'rec'>,
  input: { force?: boolean; templateId: PrefixedString<'mnt'> },
  deps: AnalysisDeps = defaultDeps,
): Promise<ServiceResult<StartRecordingAnalysisResponse>> {
  const db = getDb();

  const [recording] = await db.select().from(recordings).where(eq(recordings.id, recordingId));
  if (!recording) {
    return err('Recording not found', 404);
  }
  if (recording.status !== 'completed') {
    return err('Recording must be completed before analysis', 400);
  }

  const [existing] = await db.select().from(recordingAnalyses).where(eq(recordingAnalyses.recordingId, recordingId));

  if (existing && existing.status !== 'failed' && existing.status !== 'pending' && !input.force) {
    return ok({ analysis: await toRecordingAnalysis(existing) });
  }

  const templateResult = await getMeetingNoteTemplate(input.templateId);
  if (templateResult.error) {
    return templateResult;
  }

  const transcript: RecordingTranscriptEntry[] = await readRecordingTranscript(recordingId);
  if (transcript.length === 0) {
    return err('No transcript available for this recording', 400);
  }

  const analysisModel = await deps.resolveModel({
    providerIdKey: 'recordings.analysis.providerId',
    modelIdKey: 'recordings.analysis.modelId',
  });

  if (analysisModel.error) {
    return analysisModel;
  }

  const now = Date.now();
  const id = existing?.id ?? createRecordingAnalysisId();
  const preserveExistingUntilComplete = existing?.status === 'completed' && input.force === true;

  activeRuns.get(id)?.controller.abort();

  if (!preserveExistingUntilComplete) {
    await db
      .insert(recordingAnalyses)
      .values({
        id,
        recordingId,
        status: 'pending',
        title: '',
        templateId: input.templateId,
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
          title: '',
          templateId: input.templateId,
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

  broadcastRecordingAnalysisUpdated({ recordingId, status: 'pending', title: null });

  void runRecordingAnalysis(
    id,
    {
      recordingId,
      transcript,
      templateId: input.templateId,
      templateContent: templateResult.data.template.content,
      analysisProviderId: analysisModel.data.providerId,
      analysisModelId: analysisModel.data.modelId,
      analysisCredentials: analysisModel.data.credentials,
      preserveExistingUntilComplete,
    },
    deps,
  );

  const [created] = await db.select().from(recordingAnalyses).where(eq(recordingAnalyses.id, id));
  if (!created) {
    return err('Failed to create recording analysis', 400);
  }

  return ok({ analysis: await toRecordingAnalysis(created) });
}

export async function cancelRecordingAnalysis(recordingId: PrefixedString<'rec'>): Promise<ServiceResult<null>> {
  const db = getDb();

  const [recording] = await db.select({ id: recordings.id }).from(recordings).where(eq(recordings.id, recordingId));
  if (!recording) {
    return err('Recording not found', 404);
  }

  const [existing] = await db.select().from(recordingAnalyses).where(eq(recordingAnalyses.recordingId, recordingId));
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
    broadcastRecordingAnalysisUpdated({ recordingId, status: existing.status, title: existing.title || null });

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

  internalBus.emit('recording.analysis.failed', { recordingId });

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
    templateId: PrefixedString<'mnt'>;
    templateContent: string;
    analysisProviderId: string;
    analysisModelId: string;
    analysisCredentials: LlmProviderCredentials;
    preserveExistingUntilComplete: boolean;
  },
  deps: AnalysisDeps,
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
        .set({ status: 'processing', startedAt, endedAt: null, durationMs: null, updatedAt: Date.now() })
        .where(and(eq(recordingAnalyses.id, analysisId), eq(recordingAnalyses.recordingId, input.recordingId)));
    }

    broadcastRecordingAnalysisUpdated({ recordingId: input.recordingId, status: 'processing', title: null });

    const analysisModel = deps.createProvider(input.analysisCredentials)(input.analysisModelId);
    const analysisStart = Date.now();
    const analysisResult = await generateText({
      model: analysisModel,
      system: buildAnalysisPrompt(input.templateContent),
      messages: [
        { role: 'user', content: `Analyze this transcript.\n\n${formatTranscriptForAnalysis(input.transcript)}` },
      ],
      abortSignal: abortController.signal,
    });

    const summary = analysisResult.text.trim();
    if (!summary) {
      throw new RecordingAnalysisEmptyResponseError();
    }

    const analysisUsage = analysisResult.usage ?? ZERO_USAGE;

    const { costUsd: analysisCost } = await recordLlmUsage({
      source: 'recording_analysis',
      providerId: input.analysisProviderId,
      modelId: input.analysisModelId,
      usage: analysisUsage,
      metadata: { source: 'recording_analysis', recordingId: input.recordingId, analysisId },
      startedAt: analysisStart,
      endedAt: Date.now(),
      durationMs: Date.now() - analysisStart,
    });

    const endedAt = Date.now();
    const title = 'Recording analysis';

    if (activeRuns.get(analysisId)?.controller !== abortController) {
      return;
    }

    // Read existing transcription cost so we can add analysis cost on top
    const [currentRow] = await db
      .select({ costUsd: recordingAnalyses.costUsd })
      .from(recordingAnalyses)
      .where(eq(recordingAnalyses.id, analysisId));
    const transcriptionCost = currentRow?.costUsd ?? 0;

    await writeRecordingAnalysis(input.recordingId, summary);

    await db
      .update(recordingAnalyses)
      .set({
        status: 'completed',
        templateId: input.templateId,
        title,
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

    internalBus.emit('recording.analysis.completed', { recordingId: input.recordingId, title });
    internalBus.emit('title.generation.recording_analysis.requested', {
      recordingId: input.recordingId,
      analysisId,
      content: buildRecordingTitleContent(summary),
      fallbackProviderId: input.analysisProviderId,
      fallbackModelId: input.analysisModelId,
    });

    log.info({ analysisId, recordingId: input.recordingId }, 'recording analysis completed');
  } catch (error) {
    if (activeRuns.get(analysisId)?.controller !== abortController) {
      return;
    }

    const message = error instanceof Error ? error.message : 'Failed to analyze recording';

    if (input.preserveExistingUntilComplete) {
      log.error({ analysisId, recordingId: input.recordingId, error: message }, 'recording analysis rerun failed');
      return;
    }

    const endedAt = Date.now();

    await db
      .update(recordingAnalyses)
      .set({ status: 'failed', error: message, endedAt, durationMs: endedAt - startedAt, updatedAt: endedAt })
      .where(eq(recordingAnalyses.id, analysisId));

    internalBus.emit('recording.analysis.failed', { recordingId: input.recordingId });

    log.error({ analysisId, recordingId: input.recordingId, error: message }, 'recording analysis failed');
  } finally {
    if (activeRuns.get(analysisId)?.controller === abortController) {
      activeRuns.delete(analysisId);
    }
  }
}
