import type { ToolContext } from '@/tools/runtime/wrappers.js';
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

/**
 * A Toolset is a named group of related tools managed as a single unit.
 * Toolsets can be activated/deactivated dynamically during a session to
 * reduce context window usage.
 */
export type Toolset = {
  /** Unique identifier, e.g. "browser", "meetings", "mcp:<serverName>" */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Brief description for LLM discovery (included in system prompt catalog) */
  description: string;
  /**
   * Icon slug served at /connectors/icons/:slug (e.g. "gmail", "googledrive").
   * Used by the frontend to display a connector-specific icon for the toolset.
   */
  icon?: string;
  /**
   * Operational instructions injected into context when the toolset is activated.
   * For builtin toolsets these come from .md files; for MCP servers from the
   * `instructions` field of the initialize response.
   */
  instructions?: string;
  /** MCP prompt templates available from this toolset (user-controlled). */
  prompts?: ToolsetPrompt[];
  /** Return brief summaries of all tools in this toolset (for list_toolsets) */
  tools: () => ToolSummary[];
  /** Instantiate and return the actual AI SDK Tool objects */
  activate: (context: ToolContext) => Promise<Record<string, Tool>>;
};
