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

const SYSTEM_PROMPT = `You are a professional audio transcription assistant. Please transcribe the provided audio file into English.

The audio contains a discussion between distinct speakers. If possible, differentiate and label each speaker (e.g., Speaker 1, Speaker 2, or if names are mentioned: use their names). The discussion may pertain to any topic — prioritize accuracy in transcription, including punctuation and sentence structure, to reflect natural speech flow. Ensure accurate capture of specialized terminology if present.`;

const transcriptionSchema = z.object({
  transcript: z.string().describe('The full transcription text with speaker labels'),
  summary: z
    .string()
    .describe('A concise 2-4 sentence summary of the discussion'),
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
      system: SYSTEM_PROMPT,
    });

    const transcriptionResult = result.output;
    if (!transcriptionResult) {
      throw new Error('Model did not return a valid transcription object');
    }

    const recordingDir = path.dirname(meeting.recordingFilePath);
    const transcriptFilePath = path.join(recordingDir, `transcript-${transcriptionId}.txt`);
    fs.writeFileSync(transcriptFilePath, transcriptionResult.transcript, 'utf8');

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
        transcript: transcriptionResult.transcript,
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
  return row as Transcription | undefined;
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
  return rows as Transcription[];
}
