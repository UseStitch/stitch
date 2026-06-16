import { readFileSync } from 'node:fs';

import { buildLiquidUiCatalogPrompt } from '@stitch/shared/liquid-ui/catalog';

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

You may call render_ui without the user explicitly asking when a visual dashboard would make the answer easier to scan.

Use render_ui when the response contains comparisons, rankings, multiple entities, statuses, risks, metrics, dates, percentages, polling, financial figures, or chartable quantitative data. Good fits include briefings, reports, market maps, political race overviews, company snapshots, travel comparisons, and research summaries.

Do not use render_ui for simple explanations, single facts, short conversational answers, code/debugging tasks, or when the UI would merely repeat clear prose. Never invent data to fill a chart or stat. If data is uncertain or conflicting, mark it clearly with text or an info/warning badge.

Response pattern:
1. Complete ALL research and tool calls first (web searches, file reads, data fetches, etc.).
2. Once you have all the data you need, write 1-3 sentences of plain text.
3. Call render_ui LAST, after all other tool calls are finished. Never call render_ui mid-research.
4. End with a short conclusion or caveat only if useful.

Never write <liquid_ui>, </liquid_ui>, JSON UI specs, or fenced UI specs in assistant text. If a dashboard is appropriate, call the render_ui tool. If you cannot call render_ui, respond with plain text only.

Never duplicate information between the dashboard and the text. The dashboard is the primary surface for the data — once a metric, status, comparison, or figure is shown in the UI, do NOT restate it in prose. Text should only frame the dashboard (e.g. what it shows, how it was sourced) or add caveats the UI cannot express. Do not write a textual summary, list, or table that repeats what the render_ui call already displays.

Component selection:
- Stat for headline metrics. Use caption/trend for status tied to the metric. Use Badge separately only for standalone status labels.
- Badge for status, confidence, risk, category, or trend that is NOT tied to a specific Stat. Place Badge inside a Row or at the end of a Stack, never as a direct Grid child alongside Stat or Card nodes.
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
  { "id": "s1", "component": "Stack", "spacing": "sm", "children": ["g1", "r1"] },
  { "id": "g1", "component": "Grid",  "columns": "2", "gap": "sm", "children": ["st1", "st2"] },
  { "id": "st1", "component": "Stat", "label": "Revenue", "value": "$4.2k", "caption": null, "trend": "up" },
  { "id": "st2", "component": "Stat", "label": "Orders",  "value": "38",    "caption": null, "trend": null },
  { "id": "r1",  "component": "Row",  "gap": "sm", "align": "start", "children": ["b1"] },
  { "id": "b1",  "component": "Badge", "variant": "success", "text": "On track" }
]}

Catalog:
${buildLiquidUiCatalogPrompt()}`;
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
    semiStaticParts.push(userPrompt);
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
