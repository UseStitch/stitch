import { tool } from 'ai';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';

import { PATHS } from '@/lib/paths.js';
import { getRecordingAnalysis, startRecordingAnalysis } from '@/recordings/analysis-service.js';
import {
  getRecordingAnalysisPath,
  getRecordingTranscriptPath,
  readRecordingTranscript,
} from '@/recordings/file-store.js';
import { getSettings } from '@/settings/service.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import { TOOLSET_SUMMARY_CONTEXT, summarizeTools, type Toolset } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

const RECORDINGS_TOOLSET_ID = 'recordings';

function createRecordingsTools(_context: ToolContext): Record<string, Tool> {
  const recordings_get_analysis = tool({
    description: `Get recording analysis for one recording ID.

Returns status, file path, and Markdown meeting notes.`,
    inputSchema: z.object({
      recordingId: z.string().describe('Recording ID (e.g. rec_abc123).'),
    }),
    execute: async (input) => {
      const result = await getRecordingAnalysis(input.recordingId as PrefixedString<'rec'>);

      if ('error' in result) {
        return {
          recordingId: input.recordingId,
          found: false,
          message: result.error,
        };
      }

      if (!result.data.analysis) {
        return {
          recordingId: input.recordingId,
          found: false,
          message: 'No analysis found for this recording.',
        };
      }

      const analysis = result.data.analysis;

      return {
        recordingId: input.recordingId,
        found: true,
        status: analysis.status,
        title: analysis.title,
        filePath: getRecordingAnalysisPath(input.recordingId as PrefixedString<'rec'>),
        summary: analysis.summary,
        error: analysis.error,
        updatedAt: analysis.updatedAt,
      };
    },
  });

  const recordings_get_transcript = tool({
    description:
      'Get recording transcript for one recording ID. Returns the file path and transcript entries.',
    inputSchema: z.object({
      recordingId: z.string().describe('Recording ID (e.g. rec_abc123).'),
    }),
    execute: async (input) => {
      const recordingId = input.recordingId as PrefixedString<'rec'>;
      const transcript = await readRecordingTranscript(recordingId);

      return {
        recordingId: input.recordingId,
        found: transcript.length > 0,
        filePath: getRecordingTranscriptPath(recordingId),
        transcript,
      };
    },
  });

  const recordings_start_analysis = tool({
    description: `Start (or re-run) transcription and analysis for a completed recording.

Use this when analysis is missing or stale.`,
    inputSchema: z.object({
      recordingId: z.string().describe('Recording ID (e.g. rec_abc123).'),
      force: z.boolean().optional().describe('Force re-run even if analysis already exists.'),
    }),
    execute: async (input) => {
      const { 'recordings.analysis.defaultTemplateId': templateId } = await getSettings([
        'recordings.analysis.defaultTemplateId',
      ] as const);
      const result = await startRecordingAnalysis(input.recordingId as PrefixedString<'rec'>, {
        force: input.force,
        templateId: templateId as PrefixedString<'mnt'>,
      });

      if ('error' in result) {
        return {
          recordingId: input.recordingId,
          ok: false,
          message: result.error,
        };
      }

      return {
        recordingId: input.recordingId,
        ok: true,
        status: result.data.analysis.status,
        message: 'Recording analysis queued or already available.',
      };
    },
  });

  return {
    recordings_get_analysis,
    recordings_get_transcript,
    recordings_start_analysis,
  };
}

export function createRecordingsToolset(): Toolset {
  return {
    id: RECORDINGS_TOOLSET_ID,
    kind: 'native',
    name: 'Recordings',
    description: 'Work with recording transcription and Markdown analysis results.',
    instructions: [
      `Recordings are stored at ${PATHS.dirPaths.recordings} and can be read directly from there. Search that location for recordings.`,
      'Use grep/glob/read to find relevant recording IDs and files before fetching details.',
      'Use recordings_get_analysis for Markdown notes for one recording.',
      'Use recordings_get_transcript for transcript entries for one recording.',
      'Use recordings_start_analysis when a completed recording has no analysis or needs a forced refresh.',
    ].join('\n'),
    tools: () => summarizeTools(createRecordingsTools(TOOLSET_SUMMARY_CONTEXT)),
    activate: async (context: ToolContext) => {
      return createRecordingsTools(context);
    },
  };
}
