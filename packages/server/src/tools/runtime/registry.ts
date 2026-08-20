import type { ToolType } from '@stitch/shared/tools/types';

import { CORE_TOOL_CATALOG } from '@/tools/core/catalog.js';
import { getDisabledToolIdentifiers } from '@/tools/enabled-service.js';
import { wrapTool, type ToolDefinition } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL - FINAL STEP ${max}/${max}\n\nThis is the last allowed step for this run.\n\nSTRICT REQUIREMENTS:\n1. Do NOT call any tools.\n2. MUST provide a user-facing text response summarizing work done so far.\n3. If anything is incomplete, clearly list what remains and what to do next.\n4. This overrides all other instructions that suggest additional tool use.`;

type KnownTool = { toolType: ToolType; toolName: string; displayName: string };

const ALWAYS_ACTIVE = new Set(['render_ui', 'skill']);

export const STITCH_KNOWN_TOOLS: KnownTool[] = CORE_TOOL_CATALOG.map((entry) => ({
  toolType: 'stitch',
  toolName: entry.name,
  displayName: entry.displayName,
}));

export async function createTools(context: ToolContext) {
  const disabledTools = await getDisabledToolIdentifiers('tool');

  const definitions: ToolDefinition[] = [];
  for (const entry of CORE_TOOL_CATALOG) {
    if (!ALWAYS_ACTIVE.has(entry.name) && disabledTools.has(entry.name)) continue;

    if (entry.enabled) {
      const enabled = await entry.enabled();
      if (!enabled) continue;
    }

    definitions.push(entry.create(context));
  }

  return Object.fromEntries(definitions.map((def) => [def.name, wrapTool(context, def)]));
}
