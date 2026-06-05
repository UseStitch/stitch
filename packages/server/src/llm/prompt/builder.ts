import { readFileSync } from 'node:fs';

import { buildLiquidUiCatalogPrompt } from '@stitch/shared/liquid-ui/catalog';

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

function buildLiquidUiPromptSection(): string {
  return `<liquid_ui>
Use render_ui only when a structured visual answer is materially clearer than plain text. Prefer plain text for simple answers.

The render_ui tool input is a single flat graph: { root, nodes }. Nodes use a discriminated component field, unique ids, and child id refs. Never invent components or props. Use one render_ui call per logical UI block.

Intent mapping: data series -> Chart; headline metrics -> Stat; statuses -> Badge; grouped facts -> Card and KeyValue; short explanatory copy inside a UI block -> Text.

Catalog:
${buildLiquidUiCatalogPrompt()}
</liquid_ui>`;
}

export function buildSystemPrompt(input: {
  useBasePrompt: boolean;
  systemPrompt: string | null;
  userName?: string | null;
  userTimezone?: string | null;
  memoryContext?: string | null;
  todoContext?: string | null;
  codeModePrompt?: string | null;
  liquidUiPromptSection?: string | null;
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

  if (input.codeModePrompt?.trim()) {
    result = `${result}\n\n${input.codeModePrompt.trim()}`;
  }

  if (!input.codeModePrompt?.trim()) {
    result = `${result}\n\n${input.liquidUiPromptSection?.trim() || buildLiquidUiPromptSection()}`;
  }

  if (input.memoryContext) {
    result = `${result}\n\n<memory>\n${input.memoryContext}\n</memory>`;
  }

  if (input.todoContext) {
    result = `${result}\n\n${input.todoContext}`;
  }

  return result;
}
