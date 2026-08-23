type ParsedSlashCommand = {
  /** The command name without the leading slash, lowercased (e.g. "compact"). */
  name: string;
  /** Everything after the command name and its trailing whitespace, verbatim. */
  args: string;
};

/**
 * Parses a slash command from raw input.
 *
 * A slash command is only valid when the slash is the very first character of
 * the input (no leading whitespace). Returns null when the input is not a
 * slash command so callers can fall through to sending a normal message.
 */
export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const m = input.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
  return m ? { name: m[1].toLowerCase(), args: (m[2] ?? '').trim() } : null;
}
