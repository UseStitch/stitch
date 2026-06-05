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
You may call render_ui without the user explicitly asking when a visual dashboard would make the answer easier to scan.

Use render_ui when the response contains comparisons, rankings, multiple entities, statuses, risks, metrics, dates, percentages, polling, financial figures, or chartable quantitative data. Good fits include briefings, reports, market maps, political race overviews, company snapshots, travel comparisons, and research summaries.

Do not use render_ui for simple explanations, single facts, short conversational answers, code/debugging tasks, or when the UI would merely repeat clear prose. Never invent data to fill a chart or stat. If data is uncertain or conflicting, mark it clearly with text or an info/warning badge.

Response pattern:
1. Start with 1-3 sentences of plain text.
2. Use one render_ui call for the scan-friendly dashboard when appropriate.
3. End with a short conclusion or caveat only if useful.

Component selection:
- Stat for headline metrics.
- Badge for status, confidence, risk, category, or trend.
- Card for one entity/theme.
- Grid for comparing peer entities.
- KeyValue for factual rows.
- Chart only for real quantitative data.
- Text only for short annotations inside the dashboard.

Dashboard quality:
- Keep dashboards compact.
- Use at most one chart by default.
- Prefer 2-6 cards.
- Keep labels and badge text short.
- Use unique node IDs and only catalog components/props.

The render_ui tool input is a single flat graph: { root, nodes }. Nodes use a discriminated component field, unique ids, and child id refs. Never invent components or props. Use one render_ui call per logical UI block.

Critical rules to avoid schema rejection:
- Put ALL props DIRECTLY on each node object. NEVER use a nested "props" key.
- Enum-like numeric fields MUST be strings: "columns" is "1"/"2"/"3"/"4", not 1/2/3/4.
- Required nullable fields MUST be present: include "caption": null and "trend": null on every Stat node if unused.
- Never reference a node's own id in its children array.

Minimal valid example:
{ "root": "s1", "nodes": [
  { "id": "s1", "component": "Stack", "spacing": "sm", "children": ["g1"] },
  { "id": "g1", "component": "Grid",  "columns": "2", "gap": "sm", "children": ["st1", "b1"] },
  { "id": "st1", "component": "Stat",     "label": "Revenue", "value": "$4.2k", "caption": null, "trend": "up" },
  { "id": "b1",  "component": "Badge",    "variant": "success", "text": "On track" }
]}

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
