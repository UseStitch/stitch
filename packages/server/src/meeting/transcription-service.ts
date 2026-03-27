import { generateText, Output } from 'ai';
import { desc, eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { createTranscriptionId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { Transcription } from '@stitch/shared/meetings/types';

import { getDb } from '@/db/client.js';
import { meetings, recordingTranscriptions } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { broadcast } from '@/lib/sse.js';
import { createProvider } from '@/provider/provider.js';
import type { ProviderCredentials } from '@/provider/provider.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';
import { addUsage } from '@/utils/usage.js';

const log = Log.create({ service: 'transcription' });

const TRANSCRIPTION_PROMPT_TEMPLATE = fs
  .readFileSync(new URL('./transcription-system-prompt.md', import.meta.url), 'utf8')
  .trim();

const ANALYSIS_PROMPT_TEMPLATE = fs
  .readFileSync(new URL('./analysis-system-prompt.md', import.meta.url), 'utf8')
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

const topicSchema = z.object({
  name: z.string().describe('Descriptive topic name'),
  startIndex: z.number().describe('First transcript turn index where this topic begins'),
  endIndex: z.number().describe('Last transcript turn index for this topic'),
});

const analysisSchema = z.object({
  topics: z.array(topicSchema).describe('Identified topics with their transcript turn ranges'),
  summary: z
    .string()
    .describe('Structured markdown meeting summary using only h1 headings and bullet points'),
  title: z
    .string()
    .max(60)
    .describe('A short descriptive title (max 60 characters) for this recording'),
});

type TranscriptionInput = {
  meetingId: PrefixedString<'rec'>;
  providerId: string;
  modelId: string;
  credentials: ProviderCredentials;
};

function buildTranscriptionPrompt(): string {
  return TRANSCRIPTION_PROMPT_TEMPLATE.replaceAll(
    '{{CURRENT_DATE}}',
    new Date().toISOString().slice(0, 10),
  );
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

export async function startTranscription(
  input: TranscriptionInput,
): Promise<PrefixedString<'transcr'>> {
  const db = getDb();
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

  try {
    await db
      .update(recordingTranscriptions)
      .set({ status: 'processing', updatedAt: Date.now() })
      .where(eq(recordingTranscriptions.id, transcriptionId));

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

    const audioBuffer = fs.readFileSync(meeting.recordingFilePath);
    const audioData = new Uint8Array(audioBuffer);

    const model = createProvider(input.credentials)(input.modelId);

    // --- Pass 1: Audio → Transcript ---
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
              data: audioData,
              mediaType: 'audio/wav',
            },
            {
              type: 'text',
              text: 'Please transcribe this audio recording.',
            },
          ],
        },
      ],
      system: buildTranscriptionPrompt(),
    });

    const pass1Output = pass1Result.output;
    if (!pass1Output) {
      throw new Error('Model did not return a valid transcript');
    }

    const transcript = pass1Output.transcript;

    // --- Pass 2: Transcript text → Analysis (summary + title + topics) ---
    const formattedTranscript = formatTranscriptForAnalysis(transcript);

    const pass2Result = await generateText({
      model,
      output: Output.object({
        schema: analysisSchema,
        name: 'analysis',
        description: 'Meeting analysis with topic segmentation, summary, and title',
      }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze the following meeting transcript:\n\n${formattedTranscript}`,
            },
          ],
        },
      ],
      system: buildAnalysisPrompt(),
    });

    const pass2Output = pass2Result.output;
    if (!pass2Output) {
      throw new Error('Model did not return a valid analysis');
    }

    const recordingDir = path.dirname(meeting.recordingFilePath);
    const transcriptFilePath = path.join(recordingDir, `transcript-${transcriptionId}.txt`);
    fs.writeFileSync(transcriptFilePath, formatTranscriptForFile(transcript), 'utf8');

    // Cumulative cost from both passes
    const [pass1Cost, pass2Cost] = await Promise.all([
      calculateMessageCostUsd({
        providerId: input.providerId,
        modelId: input.modelId,
        usage: pass1Result.usage,
      }),
      calculateMessageCostUsd({
        providerId: input.providerId,
        modelId: input.modelId,
        usage: pass2Result.usage,
      }),
    ]);

    const totalCostUsd = pass1Cost + pass2Cost;
    const mergedUsage = addUsage(pass1Result.usage, pass2Result.usage);
    const durationMs = Date.now() - startedAt;

    await db
      .update(recordingTranscriptions)
      .set({
        status: 'completed',
        filePath: transcriptFilePath,
        transcript: stringifyTranscript(transcript),
        summary: pass2Output.summary,
        title: pass2Output.title,
        usage: mergedUsage,
        costUsd: totalCostUsd,
        durationMs,
        updatedAt: Date.now(),
      })
      .where(eq(recordingTranscriptions.id, transcriptionId));

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

    log.error(
      { transcriptionId, meetingId: input.meetingId, error: errorMessage },
      'transcription failed',
    );

    await db
      .update(recordingTranscriptions)
      .set({
        status: 'failed',
        errorMessage,
        durationMs,
        updatedAt: Date.now(),
      })
      .where(eq(recordingTranscriptions.id, transcriptionId));

    await broadcast('transcription-failed', {
      meetingId: input.meetingId,
      transcriptionId,
      error: errorMessage,
    });
  }
}

export async function getLatestTranscription(
  meetingId: PrefixedString<'rec'>,
): Promise<Transcription | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(recordingTranscriptions)
    .where(eq(recordingTranscriptions.meetingId, meetingId))
    .orderBy(desc(recordingTranscriptions.createdAt))
    .limit(1);
  if (!row) {
    return undefined;
  }

  return {
    ...row,
    transcript: parseTranscript(row.transcript),
  } as Transcription;
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
