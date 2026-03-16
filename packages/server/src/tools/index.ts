import type { PrefixedString } from '@openwork/shared';

import * as QuestionTool from '@/tools/question.js';
import * as WeatherTool from '@/tools/weather.js';
import * as WebfetchTool from '@/tools/webfetch.js';

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL: You are on step ${max} (final step). Tools will be disabled after this. Complete all remaining work and provide your final answer.`;

const TOOL_REGISTRY = {
  weather: WeatherTool,
  webfetch: WebfetchTool,
  question: QuestionTool,
} as const;

export function createTools(context: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  agentId: PrefixedString<'agt'>;
}) {
  return {
    weather: TOOL_REGISTRY.weather.createRegisteredTool(context),
    webfetch: TOOL_REGISTRY.webfetch.createRegisteredTool(context),
    question: TOOL_REGISTRY.question.createRegisteredTool(context),
  };
}
