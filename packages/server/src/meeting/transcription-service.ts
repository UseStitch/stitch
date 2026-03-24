import fs from 'node:fs';
import path from 'node:path';

import { generateText, Output } from 'ai';
import { desc, eq } from 'drizzle-orm';
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

const log = Log.create({ service: 'transcription' });

const SYSTEM_PROMPT_TEMPLATE = fs
  .readFileSync(new URL('./transcription-system-prompt.md', import.meta.url), 'utf8')
  .trim();

const transcriptEntrySchema = z.object({
  speaker: z
    .string()
    .min(1)
    .describe('Speaker identifier such as Speaker 1 or an explicit speaker name'),
  content: z.string().min(1).describe('The spoken utterance text for this speaker turn'),
});

const transcriptionSchema = z.object({
  transcript: z
    .array(transcriptEntrySchema)
    .min(1)
    .describe('Ordered speaker turns for the full transcript'),
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

function buildSystemPrompt(): string {
  return SYSTEM_PROMPT_TEMPLATE.replaceAll('{{CURRENT_DATE}}', new Date().toISOString().slice(0, 10));
}

function stringifyTranscript(entries: { speaker: string; content: string }[]): string {
  return JSON.stringify(entries);
}

function formatTranscriptForFile(entries: { speaker: string; content: string }[]): string {
  return entries.map((entry) => `${entry.speaker}: ${entry.content}`).join('\n\n');
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

    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, input.meetingId));

    if (!meeting?.recordingFilePath) {
      throw new Error('No recording file found for meeting');
    }

    if (!fs.existsSync(meeting.recordingFilePath)) {
      throw new Error(`Recording file not found at: ${meeting.recordingFilePath}`);
    }

    const audioBuffer = fs.readFileSync(meeting.recordingFilePath);
    const audioData = new Uint8Array(audioBuffer);

    const model = createProvider(input.credentials)(input.modelId);

    const result = await generateText({
      model,
      output: Output.object({
        schema: transcriptionSchema,
        name: 'transcription',
        description: 'Audio transcription with speaker labels, summary, and title',
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
      system: buildSystemPrompt(),
    });

    const transcriptionResult = result.output;
    if (!transcriptionResult) {
      throw new Error('Model did not return a valid transcription object');
    }

    const recordingDir = path.dirname(meeting.recordingFilePath);
    const transcriptFilePath = path.join(recordingDir, `transcript-${transcriptionId}.txt`);
    fs.writeFileSync(transcriptFilePath, formatTranscriptForFile(transcriptionResult.transcript), 'utf8');

    const costUsd = await calculateMessageCostUsd({
      providerId: input.providerId,
      modelId: input.modelId,
      usage: result.usage,
    });

    const durationMs = Date.now() - startedAt;

    await db
      .update(recordingTranscriptions)
      .set({
        status: 'completed',
        filePath: transcriptFilePath,
        transcript: stringifyTranscript(transcriptionResult.transcript),
        summary: transcriptionResult.summary,
        title: transcriptionResult.title,
        usage: result.usage,
        costUsd,
        durationMs,
        updatedAt: Date.now(),
      })
      .where(eq(recordingTranscriptions.id, transcriptionId));

    await broadcast('transcription-completed', {
      meetingId: input.meetingId,
      transcriptionId,
    });

    log.info(
      { transcriptionId, meetingId: input.meetingId, durationMs, costUsd },
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
