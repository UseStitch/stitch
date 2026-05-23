import { tool } from 'ai';
import { z } from 'zod';

import type { PrefixedString } from '@stitch/shared/id';

import { askQuestion } from '@/question/service.js';
import { permissionMiddleware } from '@/tools/runtime/middleware.js';
import { createToolRuntime } from '@/tools/runtime/runtime.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

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
}) {
  return tool({
    description:
      'Ask the user questions during execution. Use this only when you are blocked by missing information or a user decision. Do not use it when a safe default exists or when the answer can be found from context or tools.',
    inputSchema: questionInputSchema,
    execute: async (input, { toolCallId, abortSignal }) => {
      const answers = await askQuestion({
        sessionId: context.sessionId,
        questions: input.questions,
        toolCallId,
        messageId: context.messageId,
        streamRunId: context.streamRunId,
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
}) {
  return createQuestionTool(context);
}

function getPatternTargets(): string[] {
  return [];
}

function getSuggestion() {
  return null;
}

export const DISPLAY_NAME = 'Question';

export function createRegisteredTool(context: ToolContext) {
  const baseTool = createTool(context);
  return createToolRuntime(context).use(permissionMiddleware()).wrapTool('question', baseTool, {
    permission: {
      getPatternTargets,
      getSuggestion,
    },
  });
}
