import type { PrefixedString } from '@openwork/shared';

import { createQuestionTool } from './question.js';
import { truncateOutput } from './truncation.js';
import { createWeatherTool } from './weather.js';

import type { Tool } from 'ai';

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL: You are on step ${max} (final step). Tools will be disabled after this. Complete all remaining work and provide your final answer.`;

function withTruncation<T extends Tool>(t: T): T {
  const originalExecute = t.execute;
  if (!originalExecute) return t;

  const wrappedExecute = async (...args: Parameters<typeof originalExecute>) => {
    const result = await originalExecute(...args);
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    const truncated = await truncateOutput(text);
    if (truncated.truncated) return truncated.content;
    return result;
  };

  return { ...t, execute: wrappedExecute } as T;
}

export function createTools(context: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
}) {
  return {
    weather: withTruncation(createWeatherTool()),
    question: createQuestionTool(context),
  };
}
