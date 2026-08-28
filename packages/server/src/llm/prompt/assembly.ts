import type { PrefixedString } from '@stitch/shared/id';

import { buildSystemPromptLayers } from '@/llm/prompt/builder.js';
import type { PromptConfig } from '@/llm/prompt/builder.js';
import { getSessionToolsetState } from '@/llm/stream/session-toolsets.js';
import { getToolset } from '@/tools/toolsets/registry.js';
import type { ModelMessage } from 'ai';

export type { PromptConfig } from '@/llm/prompt/builder.js';

export type PromptFragment = { layer: 'semiStatic' | 'dynamic'; content: string };

function getStringContent(message: ModelMessage): string {
  return typeof message.content === 'string' ? message.content : '';
}

export function renderSystemPrompt(promptConfig: PromptConfig): string {
  const layers = buildSystemPromptLayers(promptConfig);
  const parts = [layers.static, layers.semiStatic];
  if (layers.dynamic) parts.push(layers.dynamic);
  return parts.join('\n\n');
}

export function composeWithFragments(messages: ModelMessage[], fragments: PromptFragment[]): ModelMessage[] {
  const active = fragments.filter((f) => f.content);
  if (active.length === 0) return messages;
  if (messages.length === 0) return messages;

  const result = [...messages];
  const semiStaticFragments = active.filter((f) => f.layer === 'semiStatic').map((f) => f.content);
  const dynamicFragments = active.filter((f) => f.layer === 'dynamic').map((f) => f.content);

  if (semiStaticFragments.length > 0) {
    const semiStaticIndex = result.findIndex((msg, i) => i > 0 && msg.role === 'system');
    if (semiStaticIndex !== -1) {
      const existing = getStringContent(result[semiStaticIndex]);
      result[semiStaticIndex] = { role: 'system', content: `${existing}\n\n${semiStaticFragments.join('\n\n')}` };
    } else if (result[0]?.role === 'system') {
      const existing = getStringContent(result[0]);
      result[0] = { role: 'system', content: `${existing}\n\n${semiStaticFragments.join('\n\n')}` };
    } else {
      result.unshift({ role: 'system', content: semiStaticFragments.join('\n\n') });
    }
  }

  if (dynamicFragments.length > 0) {
    const dynamicIndex = result.findLastIndex((message) => message.role === 'system');
    if (dynamicIndex !== -1) {
      const existing = getStringContent(result[dynamicIndex]);
      result[dynamicIndex] = { role: 'system', content: `${existing}\n\n${dynamicFragments.join('\n\n')}` };
    } else if (result.length > 0) {
      result.unshift({ role: 'system', content: dynamicFragments.join('\n\n') });
    }
  }

  return result;
}

export function buildActiveToolsetInstructionsBlock(sessionId: PrefixedString<'ses'>): string {
  const activeIds = getSessionToolsetState(sessionId).active.map((entry: { id: string }) => entry.id);
  const instructionBlocks = activeIds
    .map((id: string) => getToolset(id))
    .filter((ts): ts is NonNullable<ReturnType<typeof getToolset>> => !!ts?.instructions)
    .map((ts) => `### ${ts.name} Toolset Instructions\n${ts.instructions}`)
    .join('\n\n');

  return instructionBlocks ? `\n\n## Active Toolset Instructions\n\n${instructionBlocks}` : '';
}

export function buildAvailableToolsetsPrompt(
  catalog: Array<{
    id: string;
    name: string;
    description: string;
    active: boolean;
    tools?: Array<{ name: string; description: string }>;
  }>,
): string {
  if (catalog.length === 0) return '';

  const lines = catalog.map((item) => {
    const tools = (item.tools ?? [])
      .slice(0, 3)
      .map((tool) => `${tool.name}: ${tool.description}`)
      .join('; ');
    const active = item.active ? 'active' : 'inactive';
    const toolSummary = tools ? ` Tools: ${tools}.` : '';
    return `- ${item.name} (${item.id}, ${active}): ${item.description}.${toolSummary}`;
  });

  return [
    '## Available Toolsets',
    '',
    'Use `activate_toolset` when a listed toolset clearly matches the task. Prefer matching domain-specific data toolsets over generic web search: financial data for stock prices, earnings, and financials; email for email; calendar for calendar; GitHub/repository-knowledge for GitHub repository questions; databases for database questions. Use web search only when no specialized toolset can provide the needed facts. Do not activate unrelated toolsets. If a toolset is already active, call its tools directly; do not re-activate it. Do not deactivate a toolset you are likely to use again this session; only deactivate to free context when switching to an unrelated domain.',
    '',
    ...lines,
  ].join('\n');
}

export function buildExpiredToolsetsPrompt(
  expired: Array<{ id: string; expiredAtTurn: number; toolNames: string[] }>,
): string {
  if (expired.length === 0) return '';

  const lines = expired.map((entry) => {
    const toolset = getToolset(entry.id);
    const name = toolset?.name ?? entry.id;
    const tools = entry.toolNames.length > 0 ? ` Tools no longer available: ${entry.toolNames.join(', ')}.` : '';
    return `- ${name} (${entry.id}) expired at the last turn boundary.${tools}`;
  });

  return [
    '## Toolset Expiry Notice',
    '',
    'These toolsets were active in the previous run but are not loaded for this turn. Do not call their tools unless you first call `activate_toolset` again.',
    '',
    ...lines,
  ].join('\n');
}
