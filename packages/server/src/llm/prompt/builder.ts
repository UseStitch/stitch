import { readFileSync } from 'node:fs';

import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';
import { buildPromptEnvironment } from '@/llm/prompt/env.js';
import { getSettings } from '@/settings/service.js';

export type PromptConfig = {
  useBasePrompt: boolean;
  systemPrompt: string | null;
  userName: string;
  userTimezone: string;
  memoryContext: string | null;
  todoContext: string | null;
};

/**
 * System prompt split into layers for optimal prompt caching.
 * Static content stays cached regardless of memory/todo changes.
 */
type SystemPromptLayers = {
  static: string;
  semiStatic: string;
  dynamic: string;
};

function buildUserInstructionsPrompt(userPrompt: string): string {
  return `<user-instructions>
The following are custom instructions provided by the user. Adhere to them unless they conflict with safety or core system rules.

${userPrompt}
</user-instructions>`;
}

export async function getPromptUserContext(): Promise<{
  userName: string;
  userTimezone: string;
}> {
  const s = await getSettings(['profile.name', 'profile.timezone'] as const);
  return {
    userName: s['profile.name'],
    userTimezone: s['profile.timezone'],
  };
}

const identity = (userName: string) =>
  userName
    ? `You are Stitch, a local machine assistant that helps ${userName} with day-to-day tasks on their computer.`
    : 'You are Stitch, a local machine assistant that helps users with day-to-day tasks on their computer.';

const BASE_SYSTEM_PROMPT = readFileSync(
  resolveRuntimeAssetPath(
    new URL('./base-system-prompt.txt', import.meta.url),
    'llm/prompt/base-system-prompt.txt',
  ),
  'utf8',
).trim();

function buildLiquidUiPromptSection(): string {
  return `## Liquid UI / render_ui Tool

Use the liquid-ui skill before calling render_ui unless the user explicitly asks for plain text only.
The skill contains the component catalog, schema rules, examples, and guidance for when render_ui is appropriate.`;
}

function buildEnforcementGuidance(): string {
  return `## Enforcement Guidance

- Mandatory tool use: never answer from memory when a tool can produce the fact, including calculations, current data, file contents, system state, or financial/market data.
- Tool persistence: keep using tools until the task is complete and verified. If a tool returns empty or partial data, try a different query or strategy before giving up.
- Anti-fabrication: if you cannot produce a result with tools, state the blocker honestly instead of filling gaps with plausible output.
- Act, don't ask: act immediately when the request has an obvious safe default. Ask at most one focused question only when truly blocked.`;
}

export function buildSystemPromptLayers(input: PromptConfig): SystemPromptLayers {
  const userPrompt = input.systemPrompt?.trim() ?? '';

  let staticContent: string;
  if (input.useBasePrompt) {
    staticContent = `${identity(input.userName)}\n\n${BASE_SYSTEM_PROMPT}\n\n${buildEnforcementGuidance()}\n\n${buildLiquidUiPromptSection()}`;
  } else {
    staticContent = `${identity(input.userName)}\n\n${buildEnforcementGuidance()}\n\n${buildLiquidUiPromptSection()}`;
  }

  const envBlock = buildPromptEnvironment({ userTimezone: input.userTimezone });
  const semiStaticParts = [envBlock];
  if (userPrompt.length > 0) {
    semiStaticParts.push(buildUserInstructionsPrompt(userPrompt));
  }
  const semiStaticContent = semiStaticParts.join('\n\n');

  const dynamicParts: string[] = [];
  if (input.memoryContext) {
    dynamicParts.push(`<memory>\n${input.memoryContext}\n</memory>`);
  }
  if (input.todoContext) {
    dynamicParts.push(input.todoContext);
  }
  const dynamicContent = dynamicParts.join('\n\n');

  return {
    static: staticContent,
    semiStatic: semiStaticContent,
    dynamic: dynamicContent,
  };
}
