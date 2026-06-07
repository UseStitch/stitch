import { tool } from 'ai';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';

import { getRecordingAnalysis, startRecordingAnalysis } from '@/recordings/analysis-service.js';
import { getRecordingAnalysesByIds, searchRecordings } from '@/recordings/search-service.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import { TOOLSET_SUMMARY_CONTEXT, summarizeTools, type Toolset } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

const RECORDINGS_TOOLSET_ID = 'recordings';
const RECORDING_STATUSES = ['recording', 'completed', 'failed'] as const;
const RECORDING_PLATFORMS = ['manual', 'zoom', 'teams', 'slack', 'discord', 'google-meet'] as const;

function createRecordingsTools(_context: ToolContext): Record<string, Tool> {
  const recordings_search = tool({
    description: `Search recording history using title, analysis summary, and transcript-derived content.

Use this first to find relevant recording IDs before fetching detailed analysis.`,
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe('Natural language query. Leave empty to list recent recordings.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe('Maximum results (default 5, max 10).'),
      statuses: z
        .array(z.enum(RECORDING_STATUSES))
        .optional()
        .describe('Filter by recording status.'),
      platforms: z
        .array(z.enum(RECORDING_PLATFORMS))
        .optional()
        .describe('Filter by recording platform.'),
      includeAnalysisSnapshot: z
        .boolean()
        .optional()
        .describe('Include compact analysis snapshot for each hit (default false).'),
    }),
    execute: async (input) => {
      const hits = await searchRecordings({
        query: input.query,
        limit: input.limit ?? 5,
        statuses: input.statuses,
        platforms: input.platforms,
      });

      let analysisByRecordingId = new Map<
        string,
        Awaited<ReturnType<typeof getRecordingAnalysesByIds>>[number]
      >();
      if (input.includeAnalysisSnapshot === true && hits.length > 0) {
        const analyses = await getRecordingAnalysesByIds(hits.map((hit) => hit.recordingId));
        analysisByRecordingId = new Map(
          analyses.map((analysis) => [analysis.recordingId, analysis]),
        );
      }

      return {
        query: input.query ?? null,
        total: hits.length,
        recordings: hits.map((hit) => ({
          recordingId: hit.recordingId,
          title: hit.title,
          status: hit.status,
          platform: hit.platform,
          durationMs: hit.durationMs,
          startedAt: hit.startedAt,
          endedAt: hit.endedAt,
          createdAt: hit.createdAt,
          relevance: hit.relevance,
          analysis: hit.analysis,
          snippet: hit.snippet,
          analysisSnapshot:
            input.includeAnalysisSnapshot === true
              ? (() => {
                  const analysis = analysisByRecordingId.get(hit.recordingId);
                  if (!analysis) {
                    return null;
                  }
                  return {
                    status: analysis.status,
                    title: analysis.title,
                    summary: analysis.summary.slice(0, 400),
                    actionItemCount: analysis.actionItems.length,
                    blockerCount: analysis.blockers.length,
                    topicCount: analysis.topicSections.length,
                    updatedAt: analysis.updatedAt,
                  };
                })()
              : null,
        })),
      };
    },
  });

  const recordings_get_analysis = tool({
    description: `Get structured recording analysis for one recording ID.

Returns status, summary, topic sections, action items, and blockers.`,
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
      const actionItems = analysis.topicSections.flatMap((section) => section.actionItems);
      const blockers = analysis.topicSections.flatMap((section) => section.blockers);

      return {
        recordingId: input.recordingId,
        found: true,
        status: analysis.status,
        title: analysis.title,
        summary: analysis.summary,
        topicSections: analysis.topicSections,
        actionItems,
        blockers,
        error: analysis.error,
        updatedAt: analysis.updatedAt,
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
      const result = await startRecordingAnalysis(input.recordingId as PrefixedString<'rec'>, {
        force: input.force,
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
    recordings_search,
    recordings_get_analysis,
    recordings_start_analysis,
  };
}

export function createRecordingsToolset(): Toolset {
  return {
    id: RECORDINGS_TOOLSET_ID,
    name: 'Recordings',
    description:
      'Search recordings and work with transcription/analysis results, including summaries, topics, and action items.',
    instructions: [
      'Use recordings_search first to identify relevant recording IDs.',
      'Use recordings_get_analysis for details only after narrowing to one or a few recordings.',
      'Use recordings_start_analysis when a completed recording has no analysis or needs a forced refresh.',
    ].join('\n'),
    tools: () => summarizeTools(createRecordingsTools(TOOLSET_SUMMARY_CONTEXT)),
    activate: async (context: ToolContext) => {
      return createRecordingsTools(context);
    },
  };
}
