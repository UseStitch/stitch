import { readFileSync } from 'node:fs';

import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';
import { buildPromptEnvironment } from '@/llm/prompt/env.js';

const identity = (userName: string | null) => {
  const identityLine = userName
    ? `You are Stitch, a local machine assistant that helps ${userName} with day-to-day tasks on their computer.`
    : 'You are Stitch, a local machine assistant that helps users with day-to-day tasks on their computer.';
  return `
  ${identityLine}
  `;
};

const BASE_SYSTEM_PROMPT = readFileSync(
  resolveRuntimeAssetPath(
    new URL('./base-system-prompt.txt', import.meta.url),
    'llm/prompt/base-system-prompt.txt',
  ),
  'utf8',
).trim();

export function buildSystemPrompt(input: {
  useBasePrompt: boolean;
  systemPrompt: string | null;
  userName?: string | null;
  userTimezone?: string | null;
  memoryContext?: string | null;
}): string {
  const userPrompt = input.systemPrompt?.trim() ?? '';
  const userName = input.userName?.trim() || null;
  const userTimezone = input.userTimezone?.trim() || null;

  let promptBody = userPrompt;
  if (input.useBasePrompt) {
    promptBody = BASE_SYSTEM_PROMPT;
    if (userPrompt.length > 0) {
      promptBody = `${promptBody}\n\n${userPrompt}`;
    }
  }

  let result = `${identity(userName)}\n\n${buildPromptEnvironment({ userTimezone })}\n\n${promptBody}`;

  if (input.memoryContext) {
    result = `${result}\n\n<memory>\n${input.memoryContext}\n</memory>`;
  }

  return result;
}
