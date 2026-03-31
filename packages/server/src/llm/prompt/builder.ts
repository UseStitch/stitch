import { readFileSync } from 'node:fs';

import { buildPromptEnvironment } from '@/llm/prompt/env.js';

const identity = () => {
  return `
  You are Stitch a local machine assistant. You help users to interact with their local machine and perform their day to day tasks.
  `;
};

const BASE_SYSTEM_PROMPT = readFileSync(
  new URL('./base-system-prompt.txt', import.meta.url),
  'utf8',
).trim();

export function buildSystemPrompt(input: {
  useBasePrompt: boolean;
  systemPrompt: string | null;
}): string {
  const userPrompt = input.systemPrompt?.trim() ?? '';

  let promptBody = userPrompt;
  if (input.useBasePrompt) {
    promptBody = BASE_SYSTEM_PROMPT;
    if (userPrompt.length > 0) {
      promptBody = `${promptBody}\n\n${userPrompt}`;
    }
  }

  return `${identity()}\n\n${buildPromptEnvironment()}\n\n${promptBody}`;
}
