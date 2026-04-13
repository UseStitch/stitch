import type { Tool } from 'ai';

const ALWAYS_EXCLUDED_TOOLS = new Set([
  'question',
  'task',
  'execute_typescript',
  'list_toolsets',
  'activate_toolset',
  'deactivate_toolset',
  'memory',
]);

const ALWAYS_EXCLUDED_TOOLSETS = new Set(['browser']);

export type CodeModeToolFilter = {
  excludeToolsets?: string[];
  excludeTools?: string[];
  excludeToolsInToolset?: Record<string, string[]>;
};

export function applyToolFilter(
  tools: Record<string, Tool>,
  filter: CodeModeToolFilter = {},
): Record<string, Tool> {
  const { excludeToolsets = [], excludeTools = [], excludeToolsInToolset = {} } = filter;

  const specificExclusions = new Set<string>(excludeTools);

  const excludedToolsetPrefixes = [...ALWAYS_EXCLUDED_TOOLSETS, ...excludeToolsets].map((id) =>
    id.endsWith(':') ? id : `${id}:`,
  );

  for (const toolNames of Object.values(excludeToolsInToolset)) {
    for (const name of toolNames) {
      specificExclusions.add(name);
    }
  }

  const result: Record<string, Tool> = {};

  for (const [name, tool] of Object.entries(tools)) {
    if (ALWAYS_EXCLUDED_TOOLS.has(name)) continue;
    if (excludedToolsetPrefixes.some((prefix) => name.startsWith(prefix))) continue;
    if (specificExclusions.has(name)) continue;
    result[name] = tool;
  }

  return result;
}
