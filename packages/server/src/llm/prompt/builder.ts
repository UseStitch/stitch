import { readFileSync } from 'node:fs';

import { buildPromptEnvironment } from '@/llm/prompt/env.js';

const BASE_SYSTEM_PROMPT = readFileSync(
  new URL('./base-system-prompt.txt', import.meta.url),
  'utf8',
).trim();

export function buildSystemPrompt(modelId: string): string {
  return `${buildPromptEnvironment(modelId)}\n\n${BASE_SYSTEM_PROMPT}`;
}
