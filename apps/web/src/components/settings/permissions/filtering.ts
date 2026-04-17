export type KnownToolSummary = {
  toolType: 'stitch' | 'mcp' | 'plugin';
  toolName: string;
  displayName: string;
};

export type KnownToolsetSummary = {
  id: string;
  name: string;
  description: string;
  tools: { toolName: string; displayName: string }[];
};

function includesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

export function filterCoreTools(tools: KnownToolSummary[], query: string): KnownToolSummary[] {
  return tools
    .filter((tool) => tool.toolType === 'stitch')
    .filter((tool) => {
      if (!query) return true;
      return includesQuery(tool.displayName, query) || includesQuery(tool.toolName, query);
    });
}

export function filterToolsetsByQuery<T extends KnownToolsetSummary>(
  toolsets: T[],
  query: string,
): T[] {
  return toolsets.filter((toolset) => {
    if (!query) return true;

    const matchesToolset =
      includesQuery(toolset.name, query) ||
      includesQuery(toolset.id, query) ||
      includesQuery(toolset.description, query);

    if (matchesToolset) {
      return true;
    }

    return toolset.tools.some(
      (tool) => includesQuery(tool.displayName, query) || includesQuery(tool.toolName, query),
    );
  });
}
