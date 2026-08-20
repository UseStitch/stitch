import { listToolsets } from '@/tools/toolsets/registry.js';
import type { Tool } from 'ai';

const ALWAYS_EXCLUDED_TOOLS = new Set([
  'question',
  'task',
  'execute_typescript',
  'list_toolsets',
  'activate_toolset',
  'deactivate_toolset',
  'memory',
  'render_ui',
]);

const ALWAYS_EXCLUDED_TOOLSETS = new Set(['browser', 'agenda']);

export function applyToolFilter(tools: Record<string, Tool>): Record<string, Tool> {
  const excludedTools = new Set(ALWAYS_EXCLUDED_TOOLS);

  for (const toolset of listToolsets()) {
    if (ALWAYS_EXCLUDED_TOOLSETS.has(toolset.id)) {
      for (const tool of toolset.tools()) {
        excludedTools.add(tool.name);
      }
    }
  }

  const result: Record<string, Tool> = {};

  for (const [name, tool] of Object.entries(tools)) {
    if (!excludedTools.has(name)) {
      result[name] = tool;
    }
  }

  return result;
}
