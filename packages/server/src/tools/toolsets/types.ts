import type { ConnectorIconSource } from '@stitch/shared/connectors/types';

import type { McpServerPresentation } from '@/mcp/presentation.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';
import type { Tool } from 'ai';

/** Brief summary of a single tool inside a toolset, used for LLM discovery. */
export type ToolSummary = {
  name: string;
  description: string;
};

/** An MCP prompt template exposed by a toolset for user-controlled invocation. */
export type ToolsetPrompt = {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
};

export type ToolsetKind = 'native' | 'provider' | 'connector' | 'mcp';

/**
 * A Toolset is a named group of related tools managed as a single unit.
 * Toolsets can be activated/deactivated dynamically during a session to
 * reduce context window usage.
 */
export type Toolset = {
  /** Unique identifier, e.g. "browser", "mcp:<serverName>" */
  id: string;
  /** Origin category used by runtime, settings, and UI layers. */
  kind: ToolsetKind;
  /** Human-readable display name */
  name: string;
  /** Brief description for LLM discovery (included in system prompt catalog) */
  description: string;
  /** Connector icon descriptor used by the frontend to render a toolset icon. */
  icon?: ConnectorIconSource;
  /**
   * Operational instructions injected into context when the toolset is activated.
   * For builtin toolsets these come from .md files; for MCP servers from the
   * `instructions` field of the initialize response.
   */
  instructions?: string;
  /** MCP prompt templates available from this toolset (user-controlled). */
  prompts?: ToolsetPrompt[];
  /**
   * UI presentation metadata (server/tool titles and icon paths) for MCP
   * toolsets. Owned by the toolset so registry and presentation never desync.
   */
  presentation?: McpServerPresentation;
  /** Return brief summaries of all tools in this toolset (for list_toolsets) */
  tools: () => ToolSummary[];
  /** Instantiate and return the actual AI SDK Tool objects */
  activate: (context: ToolContext) => Promise<Record<string, Tool>>;
};

export const TOOLSET_SUMMARY_CONTEXT: ToolContext = {
  sessionId: 'ses_summary',
  messageId: 'msg_summary',
  streamRunId: 'summary',
};

export function summarizeTools(tools: Record<string, Tool>): ToolSummary[] {
  return Object.entries(tools).map(([name, tool]) => ({
    name,
    description: summarizeToolDescription(tool.description),
  }));
}

function summarizeToolDescription(description: string | undefined): string {
  return (
    description
      ?.split('\n')
      .find((line) => line.trim())
      ?.trim() ?? ''
  );
}
