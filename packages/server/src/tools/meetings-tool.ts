import { tool } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { MEETINGS_AGENT_KIND } from '@/agents/meetings-agent.js';
import { getDb } from '@/db/client.js';
import { meetings, recordingTranscriptions } from '@/db/schema.js';
import { withPermissionGate, withTruncation } from '@/tools/wrappers.js';
import type { AgentToolProvider } from '@/tools/agent-tool-provider-types.js';

const MEETINGS_LIST_DESCRIPTION = `Query meeting metadata from the database.

Usage:
- List all meetings, optionally filtered by status (detected, recording, completed).
- Get a specific meeting by its ID.
- Returns structured JSON with meeting metadata: id, app, status, duration, timestamps, and recording file path.`;

const meetingsListInputSchema = z.object({
  meetingId: z
    .string()
    .optional()
    .describe('If provided, return only this specific meeting by ID'),
  status: z
    .enum(['detected', 'recording', 'completed'])
    .optional()
    .describe('Filter meetings by status'),
});

async function executeMeetingsList(input: z.infer<typeof meetingsListInputSchema>) {
  const db = getDb();

  if (input.meetingId) {
    const [row] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, input.meetingId as `rec${string}`));
    if (!row) {
      return { error: `Meeting not found: ${input.meetingId}` };
    }
    return { meetings: [row] };
  }

  const rows = input.status
    ? await db
        .select()
        .from(meetings)
        .where(eq(meetings.status, input.status))
        .orderBy(desc(meetings.createdAt))
    : await db.select().from(meetings).orderBy(desc(meetings.createdAt));

  return { meetings: rows, count: rows.length };
}

function createMeetingsListTool() {
  return tool({
    description: MEETINGS_LIST_DESCRIPTION,
    inputSchema: meetingsListInputSchema,
    execute: async (input) => executeMeetingsList(input),
  });
}

const TRANSCRIPTIONS_DESCRIPTION = `Query meeting transcription data from the database.

Usage:
- Get the latest transcription for a specific meeting.
- Get all transcriptions for a specific meeting.
- Returns structured JSON with transcription metadata: id, meetingId, title, summary, transcript, status, timestamps, and file path.`;

const transcriptionsInputSchema = z.object({
  meetingId: z.string().describe('The meeting ID to get transcriptions for'),
  latest: z
    .boolean()
    .optional()
    .describe('If true, return only the most recent transcription (default: false)'),
});

function parseTranscript(transcript: string): { speaker: string; content: string }[] {
  try {
    const parsed = z
      .array(z.object({ speaker: z.string(), content: z.string() }))
      .safeParse(JSON.parse(transcript));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // Legacy transcript rows may be plain text
  }

  const fallback = transcript.trim();
  if (!fallback) return [];
  return [{ speaker: 'Speaker 1', content: fallback }];
}

async function executeTranscriptions(input: z.infer<typeof transcriptionsInputSchema>) {
  const db = getDb();
  const meetingId = input.meetingId as `rec${string}`;

  if (input.latest) {
    const [row] = await db
      .select()
      .from(recordingTranscriptions)
      .where(eq(recordingTranscriptions.meetingId, meetingId))
      .orderBy(desc(recordingTranscriptions.createdAt))
      .limit(1);

    if (!row) {
      return { error: `No transcriptions found for meeting: ${input.meetingId}` };
    }

    return {
      transcription: {
        ...row,
        transcript: parseTranscript(row.transcript),
      },
    };
  }

  const rows = await db
    .select()
    .from(recordingTranscriptions)
    .where(eq(recordingTranscriptions.meetingId, meetingId))
    .orderBy(desc(recordingTranscriptions.createdAt));

  return {
    transcriptions: rows.map((row) => ({
      ...row,
      transcript: parseTranscript(row.transcript),
    })),
    count: rows.length,
  };
}

function createTranscriptionsTool() {
  return tool({
    description: TRANSCRIPTIONS_DESCRIPTION,
    inputSchema: transcriptionsInputSchema,
    execute: async (input) => executeTranscriptions(input),
  });
}

export const meetingsToolProvider: AgentToolProvider = {
  name: 'meetings',
  appliesTo: (agent) => agent.kind === MEETINGS_AGENT_KIND,
  knownTools: () => [
    { toolType: 'stitch', toolName: 'meetings_list' },
    { toolType: 'stitch', toolName: 'meetings_transcriptions' },
  ],
  createTools: (context) => ({
    meetings_list: withTruncation(
      withPermissionGate(
        'meetings_list',
        { getPatternTargets: () => [], getSuggestion: () => null },
        createMeetingsListTool(),
        context,
      ),
    ),
    meetings_transcriptions: withTruncation(
      withPermissionGate(
        'meetings_transcriptions',
        { getPatternTargets: () => [], getSuggestion: () => null },
        createTranscriptionsTool(),
        context,
      ),
    ),
  }),
};
