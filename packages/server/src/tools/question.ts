import { tool } from 'ai';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';

import { askQuestion } from '@/question/service.js';
import type { ToolContext } from '@/tools/wrappers.js';
import { withPermissionGate, withTruncation } from '@/tools/wrappers.js';

const questionOptionSchema = z
  .object({
    label: z.string().describe('Display text (1-5 words, concise)'),
    description: z.string().describe('Explanation of choice'),
  })
  .describe('A single answer option for a question');

const questionInfoSchema = z
  .object({
    question: z.string().describe('Complete question'),
    header: z.string().describe('Very short label (max 30 chars)'),
    options: z.array(questionOptionSchema).describe('Available choices'),
    multiple: z.boolean().optional().describe('Allow selecting multiple choices'),
    custom: z.boolean().optional().describe('Allow typing a custom answer (default: true)'),
  })
  .describe('Information about a question to ask the user');

const questionInfoWithoutCustomSchema = questionInfoSchema.omit({ custom: true });

const questionInputSchema = z.object({
  questions: z.array(questionInfoWithoutCustomSchema).describe('Questions to ask the user'),
});

function createQuestionTool(context: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  subAgentId?: PrefixedString<'agt'>;
}) {
  return tool({
    description:
      'Ask the user questions during execution. Use this when you need clarification or additional information from the user before proceeding.',
    inputSchema: questionInputSchema,
    execute: async (input, { toolCallId, abortSignal }) => {
      const answers = await askQuestion({
        sessionId: context.sessionId,
        questions: input.questions,
        toolCallId,
        messageId: context.messageId,
        streamRunId: context.streamRunId,
        subAgentId: context.subAgentId,
        abortSignal,
      });

      function formatAnswer(answer: string[] | undefined): string {
        if (!answer || answer.length === 0) return 'Unanswered';
        return answer.join(', ');
      }

      const formatted = input.questions
        .map((q, i) => `"${q.question}"="${formatAnswer(answers[i])}"`)
        .join(', ');

      return {
        output: `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`,
        answers,
      };
    },
  });
}

function createTool(context: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId: string;
  subAgentId?: PrefixedString<'agt'>;
}) {
  return createQuestionTool(context);
}

function getPatternTargets(): string[] {
  return [];
}

function getSuggestion() {
  return null;
}

const shouldTruncate = false;

export const DISPLAY_NAME = 'Question';

export function createRegisteredTool(context: ToolContext) {
  const baseTool = createTool(context);
  const gatedTool = withPermissionGate(
    'question',
    {
      getPatternTargets,
      getSuggestion,
    },
    baseTool,
    context,
  );

  return shouldTruncate ? withTruncation(gatedTool) : gatedTool;
}
