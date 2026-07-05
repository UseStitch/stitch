import { parseMcpToolName } from '@stitch/shared/mcp/types';
import { humanizeToolName } from '@stitch/shared/tools/display';
import type { ToolType } from '@stitch/shared/tools/types';

import { STITCH_KNOWN_TOOLS } from '@/tools/runtime/registry.js';
import { listToolsets } from '@/tools/toolsets/registry.js';

type CatalogTool = { toolType: ToolType; toolName: string; displayName: string };

function displayNameForMcpTool(
  formattedName: string,
  presentation: { tools: Record<string, { title?: string }> } | undefined,
): string {
  const parsed = parseMcpToolName(formattedName);
  if (!parsed) return humanizeToolName(formattedName);
  return presentation?.tools[parsed.toolName]?.title ?? humanizeToolName(formattedName);
}

/** Returns the full catalog of known tools across all four sources. */
export function listKnownTools(): CatalogTool[] {
  const toolsetTools: CatalogTool[] = listToolsets().flatMap((toolset) =>
    toolset
      .tools()
      .map((tool) => ({
        toolType: (toolset.kind === 'mcp' ? 'mcp' : 'plugin') as ToolType,
        toolName: tool.name,
        displayName:
          toolset.kind === 'mcp' ? displayNameForMcpTool(tool.name, toolset.presentation) : humanizeToolName(tool.name),
      })),
  );

  return [...STITCH_KNOWN_TOOLS, ...toolsetTools];
}
