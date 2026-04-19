/**
 * Structured mention model for @-mention references in chat messages.
 * Mentions allow users to target specific toolsets, MCP servers, or connector
 * services by typing @<name> in the chat input.
 *
 * Mentions are encoded directly into the message text as @[Label](type:id)
 * tokens — no separate DB column needed. Use parseMentions / encodeMentions /
 * stripMentionTokens to work with them on both FE and BE.
 */

export type MentionType = 'toolset' | 'mcp_server' | 'connector_service';

/** A resolved mention attached to a message payload. */
export type Mention = {
  type: MentionType;
  /** The toolset / server / connector ID to activate */
  id: string;
  /** Human-readable label shown in the chip */
  label: string;
};

/** A suggestion item returned by the mention suggestions endpoint. */
export type MentionSuggestion = {
  type: MentionType;
  id: string;
  label: string;
  description: string;
  /** Optional category grouping label shown in the autocomplete dropdown */
  category: string;
};

/** Response shape for GET /chat/mentions/suggestions */
export type MentionSuggestionsResponse = {
  suggestions: MentionSuggestion[];
};

// Matches @[Label](type:id) — label may contain spaces but not ] or )
const MENTION_TOKEN_RE = /@\[([^\]]+)\]\((toolset|mcp_server|connector_service):([^)]+)\)/g;

/** Encode a list of mentions as inline tokens appended to message text. */
export function encodeMentions(text: string, mentions: Mention[]): string {
  if (mentions.length === 0) return text;
  const tokens = mentions.map((m) => `@[${m.label}](${m.type}:${m.id})`).join(' ');
  return `${text} ${tokens}`.trimStart();
}

/** Parse all @[Label](type:id) tokens out of a message string. */
export function parseMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  const re = new RegExp(MENTION_TOKEN_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    mentions.push({
      label: match[1],
      type: match[2] as MentionType,
      id: match[3],
    });
  }
  return mentions;
}

/** Remove all @[Label](type:id) tokens from display text. */
export function stripMentionTokens(text: string): string {
  return text.replace(new RegExp(MENTION_TOKEN_RE.source, 'g'), '').replace(/\s+$/, '');
}
