import { generateText, Output } from 'ai';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { createTranscriptionId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { Transcription } from '@stitch/shared/meetings/types';

import { getDb } from '@/db/client.js';
import { meetings, recordingTranscriptions, userSettings } from '@/db/schema.js';
import { iterateWavFileChunks, splitWavIntoChunks } from '@/lib/audio/wav.js';
import * as Log from '@/lib/log.js';
import { broadcast } from '@/lib/sse.js';
import { createProvider } from '@/provider/provider.js';
import type { ProviderCredentials } from '@/provider/provider.js';
import { recordUsageEvent } from '@/usage/ledger.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';
import { addUsage, ZERO_USAGE } from '@/utils/usage.js';
import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';

const log = Log.create({ service: 'transcription' });

const TRANSCRIPTION_PROMPT_TEMPLATE = fs
  .readFileSync(
    resolveRuntimeAssetPath(
      new URL('./transcription-system-prompt.md', import.meta.url),
      'meeting/transcription-system-prompt.md',
    ),
    'utf8',
  )
  .trim();

const ANALYSIS_PROMPT_TEMPLATE = fs
  .readFileSync(
    resolveRuntimeAssetPath(
      new URL('./analysis-system-prompt.md', import.meta.url),
      'meeting/analysis-system-prompt.md',
    ),
    'utf8',
  )
  .trim();

const transcriptEntrySchema = z.object({
  speaker: z
    .string()
    .min(1)
    .describe('Speaker identifier such as Speaker 1 or an explicit speaker name'),
  content: z.string().min(1).describe('The spoken utterance text for this speaker turn'),
});

const transcriptOnlySchema = z.object({
  transcript: z
    .array(transcriptEntrySchema)
    .min(1)
    .describe('Ordered speaker turns for the full transcript'),
});

const chunkAnalysisSchema = z.object({
  summary: z
    .string()
    .describe('Markdown summary for a transcript chunk using topic headings and bullet points'),
});

const finalAnalysisSchema = z.object({
  summary: z
    .string()
    .describe(
      'Structured markdown meeting summary using h1 topic headings and h2 category sub-sections',
    ),
  title: z
    .string()
    .max(60)
    .describe('A short descriptive title (max 60 characters) for this recording'),
});

type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;
const TRANSCRIPTION_CHUNK_MAX_SECS = 8 * 60;
const ANALYSIS_TRANSCRIPT_TURNS_PER_CHUNK = 220;
const STALE_TRANSCRIPTION_ERROR = 'Server restarted while transcription was running';

const activeTranscriptions = new Map<PrefixedString<'transcr'>, AbortController>();

type TranscriptionInput = {
  meetingId: PrefixedString<'rec'>;
  providerId: string;
  modelId: string;
  credentials: ProviderCredentials;
};

function buildTranscriptionPrompt(userName: string | null): string {
  const localUserLabel = userName?.trim() || 'Local User';
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

function stringifyTranscript(entries: { speaker: string; content: string }[]): string {
  return JSON.stringify(entries);
}

function formatTranscriptForFile(entries: { speaker: string; content: string }[]): string {
  return entries.map((entry) => `${entry.speaker}: ${entry.content}`).join('\n\n');
}

function formatTranscriptForAnalysis(entries: { speaker: string; content: string }[]): string {
  return entries.map((entry, i) => `[${i}] ${entry.speaker}: ${entry.content}`).join('\n');
}

function parseTranscript(transcript: string): { speaker: string; content: string }[] {
  try {
    const parsed = transcriptEntrySchema.array().safeParse(JSON.parse(transcript));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Legacy transcript rows may be plain text, not JSON.
  }

  const fallback = transcript.trim();
  if (!fallback) {
    return [];
  }

  return [{ speaker: 'Speaker 1', content: fallback }];
}

function smoothSpeakerAssignments(entries: TranscriptEntry[]): TranscriptEntry[] {
  const normalized = entries
    .map((entry) => ({ speaker: entry.speaker.trim(), content: entry.content.trim() }))
    .filter((entry) => entry.speaker.length > 0 && entry.content.length > 0);

  if (normalized.length < 3) {
    return normalized;
  }

  const smoothed = normalized.map((entry) => ({ ...entry }));
  for (let i = 1; i < smoothed.length - 1; i += 1) {
    const previous = smoothed[i - 1];
    const current = smoothed[i];
    const next = smoothed[i + 1];
    const surroundingSpeaker = previous.speaker;
    const hasSingleTurnFlip =
      surroundingSpeaker === next.speaker && current.speaker !== surroundingSpeaker;
    if (!hasSingleTurnFlip) {
      continue;
    }

    const shortTurn = current.content.split(/\s+/).length <= 6;
    if (shortTurn) {
      smoothed[i] = { ...current, speaker: surroundingSpeaker };
    }
  }

  return smoothed;
}

function chunkTranscriptEntries(
  entries: TranscriptEntry[],
  chunkSize: number,
): TranscriptEntry[][] {
  if (entries.length <= chunkSize) {
    return [entries];
  }

  const chunks: TranscriptEntry[][] = [];
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function startTranscription(
  input: TranscriptionInput,
): Promise<PrefixedString<'transcr'>> {
  const db = getDb();

  const [existing] = await db
    .select({ id: recordingTranscriptions.id })
    .from(recordingTranscriptions)
    .where(
      and(
        eq(recordingTranscriptions.meetingId, input.meetingId),
        eq(recordingTranscriptions.providerId, input.providerId),
        eq(recordingTranscriptions.modelId, input.modelId),
        inArray(recordingTranscriptions.status, ['pending', 'processing']),
      ),
    )
    .orderBy(desc(recordingTranscriptions.createdAt));

  if (existing) {
    return existing.id;
  }

  const transcriptionId = createTranscriptionId();
  const now = Date.now();

  await db.insert(recordingTranscriptions).values({
    id: transcriptionId,
    meetingId: input.meetingId,
    status: 'pending',
    modelId: input.modelId,
    providerId: input.providerId,
    createdAt: now,
    updatedAt: now,
  });

  void runTranscription(transcriptionId, input);

  return transcriptionId;
}

async function runTranscription(
  transcriptionId: PrefixedString<'transcr'>,
  input: TranscriptionInput,
): Promise<void> {
  const db = getDb();
  const startedAt = Date.now();
  const usageRunId = randomUUID();
  const abortController = new AbortController();
  activeTranscriptions.set(transcriptionId, abortController);
  const usageRecords: NonNullable<Transcription['usage']>[] = [];

  try {
    const processingRows = await db
      .update(recordingTranscriptions)
      .set({ status: 'processing', updatedAt: Date.now() })
      .where(eq(recordingTranscriptions.id, transcriptionId))
      .returning({ id: recordingTranscriptions.id });

    if (processingRows.length === 0 || abortController.signal.aborted) {
      return;
    }

    await broadcast('transcription-started', {
      meetingId: input.meetingId,
      transcriptionId,
    });

    const [meeting] = await db.select().from(meetings).where(eq(meetings.id, input.meetingId));

    if (!meeting?.recordingFilePath) {
      throw new Error('No recording file found for meeting');
    }

    if (!fs.existsSync(meeting.recordingFilePath)) {
      throw new Error(`Recording file not found at: ${meeting.recordingFilePath}`);
    }

    const [profileNameRow] = await db
      .select({ value: userSettings.value })
      .from(userSettings)
      .where(eq(userSettings.key, 'profile.name'));
    const profileName = profileNameRow?.value.trim() || null;

    const model = createProvider(input.credentials)(input.modelId);
    const transcriptionPrompt = buildTranscriptionPrompt(profileName);
    const transcriptParts: TranscriptEntry[][] = [];

    // --- Pass 1: Audio -> Transcript (chunked for long recordings) ---
    for await (const chunk of iterateWavFileChunks(
      meeting.recordingFilePath,
      TRANSCRIPTION_CHUNK_MAX_SECS,
    )) {
      if (abortController.signal.aborted) {
        return;
      }

      const pass1Result = await generateText({
        model,
        output: Output.object({
          schema: transcriptOnlySchema,
          name: 'transcription',
          description: 'Audio transcription with speaker labels',
        }),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: chunk.audioData,
                mediaType: 'audio/wav',
              },
              {
                type: 'text',
                text:
                  chunk.totalChunks === 1
                    ? 'Please transcribe this audio recording.'
                    : `Please transcribe chunk ${chunk.chunkIndex} of ${chunk.totalChunks} from this audio recording. Keep speaker labels stable.`,
              },
            ],
          },
        ],
        system: transcriptionPrompt,
        abortSignal: abortController.signal,
      });

      if (abortController.signal.aborted) {
        return;
      }

      const pass1Output = pass1Result.output;
      if (!pass1Output) {
        throw new Error(`Model did not return a valid transcript for chunk ${chunk.chunkIndex}`);
      }

      transcriptParts.push(pass1Output.transcript);
      usageRecords.push(pass1Result.usage);

      const pass1CostUsd = await calculateMessageCostUsd({
        providerId: input.providerId,
        modelId: input.modelId,
        usage: pass1Result.usage,
      });
      await recordUsageEvent({
        runId: usageRunId,
        source: 'transcription_pass1',
        status: 'succeeded',
        meetingId: input.meetingId,
        transcriptionId,
        providerId: input.providerId,
        modelId: input.modelId,
        usage: pass1Result.usage,
        costUsd: pass1CostUsd,
        stepIndex: chunk.chunkIndex,
        metadata: {
          phase: 'pass1',
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
        },
        startedAt,
      });
    }

    const transcript = smoothSpeakerAssignments(transcriptParts.flat());

    // --- Pass 2: Transcript -> Chunk summaries ---
    const transcriptChunks = chunkTranscriptEntries(
      transcript,
      ANALYSIS_TRANSCRIPT_TURNS_PER_CHUNK,
    );
    const chunkSummaries: string[] = [];

    for (let i = 0; i < transcriptChunks.length; i += 1) {
      if (abortController.signal.aborted) {
        return;
      }

      const chunk = transcriptChunks[i];
      const formattedChunkTranscript = formatTranscriptForAnalysis(chunk);
      const analysisChunkResult = await generateText({
        model,
        output: Output.object({
          schema: chunkAnalysisSchema,
          name: 'analysis_chunk',
          description: 'Chunk-level summary for a transcript segment',
        }),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Summarize transcript chunk ${i + 1} of ${transcriptChunks.length}.\n\n${formattedChunkTranscript}`,
              },
            ],
          },
        ],
        system: buildAnalysisPrompt(),
        abortSignal: abortController.signal,
      });

      if (abortController.signal.aborted) {
        return;
      }

      const chunkOutput = analysisChunkResult.output;
      if (!chunkOutput) {
        throw new Error(`Model did not return a valid chunk summary for chunk ${i + 1}`);
      }

      chunkSummaries.push(chunkOutput.summary);
      usageRecords.push(analysisChunkResult.usage);

      const chunkAnalysisCostUsd = await calculateMessageCostUsd({
        providerId: input.providerId,
        modelId: input.modelId,
        usage: analysisChunkResult.usage,
      });
      await recordUsageEvent({
        runId: usageRunId,
        source: 'transcription_chunk_analysis',
        status: 'succeeded',
        meetingId: input.meetingId,
        transcriptionId,
        providerId: input.providerId,
        modelId: input.modelId,
        usage: analysisChunkResult.usage,
        costUsd: chunkAnalysisCostUsd,
        stepIndex: i + 1,
        metadata: {
          phase: 'chunk-analysis',
          chunkIndex: i + 1,
          totalChunks: transcriptChunks.length,
          transcriptTurnsInChunk: chunk.length,
        },
        startedAt,
      });
    }

    // --- Pass 3: Merge chunk summaries -> final title + summary ---
    const mergedChunkSummaries = chunkSummaries
      .map((summary, i) => `# Chunk ${i + 1}\n${summary}`)
      .join('\n\n');

    const finalAnalysisResult = await generateText({
      model,
      output: Output.object({
        schema: finalAnalysisSchema,
        name: 'analysis_final',
        description: 'Final meeting summary and title based on chunk summaries',
      }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Merge these chunk summaries into one final meeting summary and title:\n\n${mergedChunkSummaries}`,
            },
          ],
        },
      ],
      system: buildAnalysisPrompt(),
      abortSignal: abortController.signal,
    });

    if (abortController.signal.aborted) {
      return;
    }

    const finalAnalysisOutput = finalAnalysisResult.output;
    if (!finalAnalysisOutput) {
      throw new Error('Model did not return a valid final analysis');
    }
    usageRecords.push(finalAnalysisResult.usage);

    const finalAnalysisCostUsd = await calculateMessageCostUsd({
      providerId: input.providerId,
      modelId: input.modelId,
      usage: finalAnalysisResult.usage,
    });
    await recordUsageEvent({
      runId: usageRunId,
      source: 'transcription_final_analysis',
      status: 'succeeded',
      meetingId: input.meetingId,
      transcriptionId,
      providerId: input.providerId,
      modelId: input.modelId,
      usage: finalAnalysisResult.usage,
      costUsd: finalAnalysisCostUsd,
      metadata: {
        phase: 'final-analysis',
        transcriptChunkCount: transcriptChunks.length,
      },
      startedAt,
    });

    const recordingDir = path.dirname(meeting.recordingFilePath);
    const transcriptFilePath = path.join(recordingDir, `transcript-${transcriptionId}.txt`);
    fs.writeFileSync(transcriptFilePath, formatTranscriptForFile(transcript), 'utf8');

    const costs = await Promise.all(
      usageRecords.map((usage) =>
        calculateMessageCostUsd({
          providerId: input.providerId,
          modelId: input.modelId,
          usage,
        }),
      ),
    );

    const totalCostUsd = costs.reduce((sum, cost) => sum + cost, 0);
    const mergedUsage = usageRecords.reduce((acc, usage) => addUsage(acc, usage), ZERO_USAGE);
    const durationMs = Date.now() - startedAt;

    const completedRows = await db
      .update(recordingTranscriptions)
      .set({
        status: 'completed',
        filePath: transcriptFilePath,
        transcript: stringifyTranscript(transcript),
        summary: finalAnalysisOutput.summary,
        title: finalAnalysisOutput.title,
        usage: mergedUsage,
        costUsd: totalCostUsd,
        durationMs,
        updatedAt: Date.now(),
      })
      .where(eq(recordingTranscriptions.id, transcriptionId))
      .returning({ id: recordingTranscriptions.id });

    if (completedRows.length === 0 || abortController.signal.aborted) {
      await rm(transcriptFilePath, { force: true }).catch(() => undefined);
      return;
    }

    await broadcast('transcription-completed', {
      meetingId: input.meetingId,
      transcriptionId,
    });

    log.info(
      { transcriptionId, meetingId: input.meetingId, durationMs, costUsd: totalCostUsd },
      'transcription completed',
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startedAt;
    const mergedUsage = usageRecords.reduce((acc, usage) => addUsage(acc, usage), ZERO_USAGE);
    const costs = await Promise.all(
      usageRecords.map((usage) =>
        calculateMessageCostUsd({
          providerId: input.providerId,
          modelId: input.modelId,
          usage,
        }),
      ),
    );
    const partialCostUsd = costs.reduce((sum, cost) => sum + cost, 0);

    log.error(
      { transcriptionId, meetingId: input.meetingId, error: errorMessage },
      'transcription failed',
    );

    const failedRows = await db
      .update(recordingTranscriptions)
      .set({
        status: 'failed',
        errorMessage,
        usage: mergedUsage,
        costUsd: partialCostUsd,
        durationMs,
        updatedAt: Date.now(),
      })
      .where(eq(recordingTranscriptions.id, transcriptionId))
      .returning({ id: recordingTranscriptions.id });

    if (failedRows.length === 0 || abortController.signal.aborted) {
      return;
    }

    await broadcast('transcription-failed', {
      meetingId: input.meetingId,
      transcriptionId,
      error: errorMessage,
    });

    const failedAt = Date.now();
    await recordUsageEvent({
      runId: usageRunId,
      source: 'transcription',
      status: 'failed',
      meetingId: input.meetingId,
      transcriptionId,
      providerId: input.providerId,
      modelId: input.modelId,
      usage: mergedUsage,
      costUsd: partialCostUsd,
      errorCode: errorMessage,
      metadata: {
        phase: 'transcription-run',
      },
      startedAt,
      endedAt: failedAt,
      durationMs,
    });
  } finally {
    activeTranscriptions.delete(transcriptionId);
  }
}

export async function getPreferredTranscription(
  meetingId: PrefixedString<'rec'>,
): Promise<Transcription | undefined> {
  const rows = await getTranscriptions(meetingId);
  if (rows.length === 0) {
    return undefined;
  }

  const latestCompleted = rows.find((row) => row.status === 'completed');
  return latestCompleted ?? rows[0];
}

export async function getTranscriptions(
  meetingId: PrefixedString<'rec'>,
): Promise<Transcription[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(recordingTranscriptions)
    .where(eq(recordingTranscriptions.meetingId, meetingId))
    .orderBy(desc(recordingTranscriptions.createdAt));
  return rows.map((row) => ({
    ...row,
    transcript: parseTranscript(row.transcript),
  })) as Transcription[];
}

export async function deleteTranscription(
  meetingId: PrefixedString<'rec'>,
  transcriptionId: PrefixedString<'transcr'>,
): Promise<void> {
  activeTranscriptions.get(transcriptionId)?.abort();

  const db = getDb();
  const [row] = await db
    .select()
    .from(recordingTranscriptions)
    .where(
      and(
        eq(recordingTranscriptions.id, transcriptionId),
        eq(recordingTranscriptions.meetingId, meetingId),
      ),
    );

  if (!row) {
    throw new Error(`Transcription not found: ${transcriptionId}`);
  }

  if (row.filePath) {
    await rm(row.filePath, { force: true }).catch(() => undefined);
  }

  await db
    .delete(recordingTranscriptions)
    .where(
      and(
        eq(recordingTranscriptions.id, transcriptionId),
        eq(recordingTranscriptions.meetingId, meetingId),
      ),
    );
}

export async function recoverStaleTranscriptions(): Promise<number> {
  const db = getDb();
  const now = Date.now();

  const recoveredRows = await db
    .update(recordingTranscriptions)
    .set({
      status: 'failed',
      errorMessage: STALE_TRANSCRIPTION_ERROR,
      updatedAt: now,
    })
    .where(inArray(recordingTranscriptions.status, ['pending', 'processing']))
    .returning({ id: recordingTranscriptions.id });

  if (recoveredRows.length > 0) {
    log.warn({ count: recoveredRows.length }, 'recovered stale transcriptions');
  }

  return recoveredRows.length;
}

export const transcriptionInternals = {
  buildTranscriptionPrompt,
  splitWavIntoChunks,
  smoothSpeakerAssignments,
  chunkTranscriptEntries,
};
