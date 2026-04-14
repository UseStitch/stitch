import type { Tool } from 'ai';

import { listToolsets } from '@/tools/toolsets/registry.js';

const ALWAYS_EXCLUDED_TOOLS = new Set([
  'question',
  'task',
  'execute_typescript',
  'list_toolsets',
  'activate_toolset',
  'deactivate_toolset',
  'memory',
]);

const ALWAYS_EXCLUDED_TOOLSETS = new Set(['browser', 'agenda']);

function normalizeToolsetId(toolsetId: string): string {
  return toolsetId.endsWith(':') ? toolsetId.slice(0, -1) : toolsetId;
}

export type CodeModeToolFilter = {
  excludeToolsets?: string[];
  excludeTools?: string[];
  excludeToolsInToolset?: Record<string, string[]>;
};

export function applyToolFilter(
  tools: Record<string, Tool>,
  filter: CodeModeToolFilter = {},
): Record<string, Tool> {
  const {
    excludeToolsets = [],
    excludeTools = [],
    excludeToolsInToolset = {},
  } = filter;

  const specificExclusions = new Set<string>(excludeTools);

  const toolNamesByToolset = new Map<string, Set<string>>();
  for (const toolset of listToolsets()) {
    toolNamesByToolset.set(
      toolset.id,
      new Set(toolset.tools().map((toolSummary) => toolSummary.name)),
    );
  }

  const excludedToolsetIds = new Set<string>(
    [...ALWAYS_EXCLUDED_TOOLSETS, ...excludeToolsets].map(normalizeToolsetId),
  );

  for (const excludedToolsetId of excludedToolsetIds) {
    const toolNames = toolNamesByToolset.get(excludedToolsetId);
    if (!toolNames) continue;
    for (const toolName of toolNames) {
      specificExclusions.add(toolName);
    }
  }

  for (const [toolsetId, toolNames] of Object.entries(excludeToolsInToolset)) {
    const normalizedToolsetId = normalizeToolsetId(toolsetId);
    const knownToolNames = toolNamesByToolset.get(normalizedToolsetId);
    if (!knownToolNames) {
      for (const toolName of toolNames) {
        specificExclusions.add(toolName);
      }
      continue;
    }

    for (const toolName of toolNames) {
      if (knownToolNames.has(toolName)) {
        specificExclusions.add(toolName);
      }
    }
  }

  const result: Record<string, Tool> = {};

  for (const [name, tool] of Object.entries(tools)) {
    if (ALWAYS_EXCLUDED_TOOLS.has(name)) continue;
    if (specificExclusions.has(name)) continue;
    result[name] = tool;
  }

  return result;
}
