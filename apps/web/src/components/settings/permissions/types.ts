export type EditingTarget =
  | { type: 'tool'; toolName: string; displayName: string; enabledScope: 'tool' | 'toolset' | 'mcp_tool' }
  | {
      type: 'toolset';
      toolsetId: string;
      displayName: string;
      subtitle: string;
      tools: { toolName: string; displayName: string }[];
      perToolEnabledScope?: 'tool' | 'mcp_tool';
    };
