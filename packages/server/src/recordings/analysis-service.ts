import { generateText } from 'ai';
import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
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
import { createProvider } from '@/llm/provider/provider.js';
import { resolveModel } from '@/llm/resolve-model.js';
import type { LlmProviderCredentials } from '@/provider/config/schema.js';
import { RecordingAnalysisEmptyResponseError } from '@/recordings/errors.js';
import { readRecordingAnalysis, readRecordingTranscript, writeRecordingAnalysis } from '@/recordings/file-store.js';
import { getMeetingNoteTemplate } from '@/recordings/meeting-note-templates.js';
import { recordLlmUsage } from '@/usage/ledger.js';
import { ZERO_USAGE } from '@/utils/usage.js';

const log = Log.create({ service: 'recordings-analysis' });

const ANALYSIS_PROMPT_TEMPLATE = readFileSync(
  resolveRuntimeAssetPath(
    new URL('../meeting/analysis-system-prompt.md', import.meta.url),
    'meeting/analysis-system-prompt.md',
  ),
  'utf8',
).trim();

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

export async function getRecordingAnalysis(recordingId: PrefixedString<'rec'>): Promise<RecordingAnalysisResponse> {
  const db = getDb();

  const recording = (await db.select({ id: recordings.id }).from(recordings).where(eq(recordings.id, recordingId))).at(
    0,
  );
  if (!recording) {
    throw new HTTPException(404, { message: 'Recording not found' });
  }

  const analysis = (await db.select().from(recordingAnalyses).where(eq(recordingAnalyses.recordingId, recordingId))).at(
    0,
  );

  return { analysis: analysis ? await toRecordingAnalysis(analysis) : null };
}

export async function startRecordingAnalysis(
  recordingId: PrefixedString<'rec'>,
  input: { force?: boolean; templateId: PrefixedString<'mnt'> },
): Promise<StartRecordingAnalysisResponse> {
  const db = getDb();

  const recording = (await db.select().from(recordings).where(eq(recordings.id, recordingId))).at(0);
  if (!recording) {
    throw new HTTPException(404, { message: 'Recording not found' });
  }
  if (recording.status !== 'completed') {
    throw new HTTPException(400, { message: 'Recording must be completed before analysis' });
  }

  const existing = (await db.select().from(recordingAnalyses).where(eq(recordingAnalyses.recordingId, recordingId))).at(
    0,
  );

  if (existing && existing.status !== 'failed' && existing.status !== 'pending' && !input.force) {
    return { analysis: await toRecordingAnalysis(existing) };
  }

  const templateResult = await getMeetingNoteTemplate(input.templateId);

  const transcript: RecordingTranscriptEntry[] = await readRecordingTranscript(recordingId);
  if (transcript.length === 0) {
    throw new HTTPException(400, { message: 'No transcript available for this recording' });
  }

  const analysisModel = await resolveModel({
    providerIdKey: 'recordings.analysis.providerId',
    modelIdKey: 'recordings.analysis.modelId',
  });

  const now = Date.now();
  const id = existing?.id ?? createRecordingAnalysisId();
  const preserveExistingUntilComplete = existing?.status === 'completed' && input.force === true;

  activeRuns.get(id)?.controller.abort();

  if (!preserveExistingUntilComplete) {
    const analysisValues = {
      id,
      status: 'pending' as const,
      title: '',
      templateId: input.templateId,
      error: null,
      transcriptionProviderId: existing?.transcriptionProviderId ?? null,
      transcriptionModelId: existing?.transcriptionModelId ?? null,
      analysisProviderId: analysisModel.providerId,
      analysisModelId: analysisModel.modelId,
      usage: ZERO_USAGE,
      startedAt: null,
      endedAt: null,
      durationMs: null,
      updatedAt: now,
    };
    await db
      .insert(recordingAnalyses)
      .values({
        ...analysisValues,
        recordingId,
        costUsd: existing?.costUsd ?? 0,
        createdAt: existing?.createdAt ?? now,
      })
      .onConflictDoUpdate({ target: recordingAnalyses.recordingId, set: analysisValues });
  }

  internalBus.emit('recording.analysis.updated', { recordingId, status: 'pending', title: null });

  void runRecordingAnalysis(id, {
    recordingId,
    transcript,
    templateId: input.templateId,
    templateContent: templateResult.template.content,
    analysisProviderId: analysisModel.providerId,
    analysisModelId: analysisModel.modelId,
    analysisCredentials: analysisModel.credentials,
    preserveExistingUntilComplete,
  });

  const created = (await db.select().from(recordingAnalyses).where(eq(recordingAnalyses.id, id))).at(0);
  if (!created) {
    throw new HTTPException(400, { message: 'Failed to create recording analysis' });
  }

  return { analysis: await toRecordingAnalysis(created) };
}

export async function cancelRecordingAnalysis(recordingId: PrefixedString<'rec'>): Promise<void> {
  const db = getDb();

  const recording = (await db.select({ id: recordings.id }).from(recordings).where(eq(recordings.id, recordingId))).at(
    0,
  );
  if (!recording) {
    throw new HTTPException(404, { message: 'Recording not found' });
  }

  const existing = (await db.select().from(recordingAnalyses).where(eq(recordingAnalyses.recordingId, recordingId))).at(
    0,
  );
  if (!existing) {
    throw new HTTPException(404, { message: 'Recording analysis not found' });
  }

  const activeRun = activeRuns.get(existing.id);
  if (!activeRun && existing.status !== 'processing') {
    throw new HTTPException(400, { message: 'Recording analysis is not running' });
  }

  activeRuns.delete(existing.id);
  activeRun?.controller.abort();

  if (activeRun?.preserveExistingUntilComplete) {
    internalBus.emit('recording.analysis.updated', {
      recordingId,
      status: existing.status,
      title: existing.title || null,
    });

    return;
  }

  const endedAt = Date.now();
  const updated = (
    await db
      .update(recordingAnalyses)
      .set({
        status: 'failed',
        error: null,
        endedAt,
        durationMs: existing.startedAt ? endedAt - existing.startedAt : null,
        updatedAt: endedAt,
      })
      .where(eq(recordingAnalyses.id, existing.id))
      .returning()
  ).at(0);

  internalBus.emit('recording.analysis.failed', { recordingId });

  if (!updated) {
    throw new HTTPException(400, { message: 'Failed to cancel recording analysis' });
  }
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

    internalBus.emit('recording.analysis.updated', {
      recordingId: input.recordingId,
      status: 'processing',
      title: null,
    });

    const analysisModel = createProvider(input.analysisCredentials)(input.analysisModelId);
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

    const analysisUsage = analysisResult.usage;

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
    const currentRow = (
      await db
        .select({ costUsd: recordingAnalyses.costUsd })
        .from(recordingAnalyses)
        .where(eq(recordingAnalyses.id, analysisId))
    ).at(0);
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

    const message = Error.isError(error) ? error.message : 'Failed to analyze recording';

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
