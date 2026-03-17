import { readFileSync } from 'node:fs';

import { buildPromptEnvironment } from '@/llm/prompt/env.js';

const identity = () => {
  return `
  You are Agentloops a local machine assistant. You help users to interact with their local machine and perform their day to day tasks.
  `;
};

const BASE_SYSTEM_PROMPT = readFileSync(
  new URL('./base-system-prompt.txt', import.meta.url),
  'utf8',
).trim();

export function buildSystemPrompt(modelId: string): string {
  return `${identity()}\n\n${buildPromptEnvironment(modelId)}\n\n${BASE_SYSTEM_PROMPT}`;
}
