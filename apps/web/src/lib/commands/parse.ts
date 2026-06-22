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
  if (input[0] !== '/') return null;

  const withoutSlash = input.slice(1);
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(withoutSlash);
  if (!match) return null;

  return {
    name: match[1].toLowerCase(),
    args: match[2]?.trim() ?? '',
  };
}
