export const TOOL_TYPES = ['stitch', 'mcp', 'plugin'] as const;

export type ToolType = (typeof TOOL_TYPES)[number];
