import { tool } from 'ai';
import { z } from 'zod';

import { QuestionInfoSchema } from '@stitch/shared/questions/types';

import { askQuestion } from '@/question/service.js';
import type { ToolDefinition } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

const questionInfoWithoutCustomSchema = QuestionInfoSchema.omit({ custom: true });

const questionInputSchema = z.object({
  questions: z.array(questionInfoWithoutCustomSchema).describe('Questions to ask the user'),
});

function createQuestionTool(context: ToolContext) {
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

      const formatted = input.questions.map((q, i) => `"${q.question}"="${formatAnswer(answers[i])}"`).join(', ');

      return {
        output: `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`,
        answers,
      };
    },
  });
}

function getPatternTargets(): string[] {
  return [];
}

export function createDefinition(context: ToolContext): ToolDefinition {
  return {
    name: 'question',
    displayName: 'Question',
    tool: createQuestionTool(context),
    permission: { getPatternTargets },
  };
}
