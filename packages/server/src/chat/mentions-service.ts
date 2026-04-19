import type { Mention, MentionSuggestion } from '@stitch/shared/chat/mentions';

import { listToolsets } from '@/tools/toolsets/registry.js';
/**
 * Build mention suggestions from registered toolsets.
 * Sources: toolsets (native, mcp, connector).
 */
export function getMentionSuggestions(query: string): MentionSuggestion[] {
  const q = query.toLowerCase().trim();
  const toolsets = listToolsets();

  const suggestions: MentionSuggestion[] = toolsets
    .filter((ts) => {
      if (!q) return true;
      return ts.name.toLowerCase().includes(q) || ts.description.toLowerCase().includes(q);
    })
    .map((ts) => {
      const category = resolveToolsetCategory(ts.id);
      return {
        type: resolveToolsetMentionType(ts.id),
        id: ts.id,
        label: ts.name,
        description: ts.description,
        category,
      };
    });

  return suggestions;
}

function resolveToolsetMentionType(toolsetId: string): Mention['type'] {
  if (toolsetId.startsWith('mcp:')) return 'mcp_server';
  if (toolsetId.startsWith('connector:')) return 'connector_service';
  return 'toolset';
}

function resolveToolsetCategory(toolsetId: string): string {
  if (toolsetId.startsWith('mcp:')) return 'MCP Servers';
  if (toolsetId.startsWith('connector:')) return 'Connectors';
  return 'Toolsets';
}

/**
 * Resolve structured mentions to a list of toolset IDs to activate.
 * Returns the deduplicated set of toolset IDs referenced by the mentions.
 */
export function resolveMentionToolsetIds(mentions: Mention[]): string[] {
  const ids = new Set<string>();
  for (const mention of mentions) {
    ids.add(mention.id);
  }
  return [...ids];
}

/**
 * Build a <mention_context> system hint block from resolved mentions.
 * This block is injected into the LLM system prompt for the current turn.
 */
export function buildMentionContextBlock(mentions: Mention[]): string {
  if (mentions.length === 0) return '';

  const lines = mentions.map((m) => `- ${m.label} (${m.id})`).join('\n');
  return `\n\n<mention_context>\nThe user has explicitly referenced the following in this message:\n${lines}\nFocus your response and tool use on these resources.\n</mention_context>`;
}
