import type { ToolType } from '@stitch/shared/tools/types';

import { CORE_TOOL_CATALOG, entryMeta, type CatalogEntry } from '@/tools/core/catalog.js';
import { getDisabledToolIdentifiers } from '@/tools/enabled-service.js';
import { ToolPipeline, type ToolDefinition } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL - FINAL STEP ${max}/${max}\n\nThis is the last allowed step for this run.\n\nSTRICT REQUIREMENTS:\n1. Do NOT call any tools.\n2. MUST provide a user-facing text response summarizing work done so far.\n3. If anything is incomplete, clearly list what remains and what to do next.\n4. This overrides all other instructions that suggest additional tool use.`;

type KnownTool = { toolType: ToolType; toolName: string; displayName: string };

/** Tools that are always active regardless of user disable settings. */
const ALWAYS_ACTIVE = new Set(['render_ui', 'skill']);

/** Derive the known tools list from the catalog — no manual duplication. */
export const STITCH_KNOWN_TOOLS: KnownTool[] = CORE_TOOL_CATALOG.map((entry) => {
  const { name, displayName } = entryMeta(entry);
  return { toolType: 'stitch', toolName: name, displayName };
});

/** Resolve a catalog entry into a ToolDefinition given a context. */
function resolveEntry(entry: CatalogEntry, context: ToolContext): ToolDefinition {
  if (entry.kind === 'static') return entry.definition;
  return entry.create(context);
}

export async function createTools(context: ToolContext) {
  const disabledTools = await getDisabledToolIdentifiers('tool');

  const definitions: ToolDefinition[] = [];
  for (const entry of CORE_TOOL_CATALOG) {
    const { name } = entryMeta(entry);

    // Check user-disabled list (unless always active)
    if (!ALWAYS_ACTIVE.has(name) && disabledTools.has(name)) continue;

    // Check conditional enablement
    if (entry.kind === 'contextual' && entry.enabled) {
      const enabled = await entry.enabled();
      if (!enabled) continue;
    }

    definitions.push(resolveEntry(entry, context));
  }

  const pipeline = ToolPipeline.create(context);
  return pipeline.registerAll(definitions);
}
