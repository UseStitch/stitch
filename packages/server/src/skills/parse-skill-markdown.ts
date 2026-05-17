import type { SkillCreateInput } from '@stitch/shared/skills/types';

/**
 * Parse a SKILL.md string into a SkillCreateInput.
 *
 * Handles all three YAML scalar styles for `name` and `description`:
 *   - Double-quoted:  description: "foo \"bar\" baz"
 *   - Single-quoted:  description: 'foo bar'
 *   - Bare:           description: foo bar
 *
 * Returns null if the frontmatter block is missing or either required
 * field cannot be extracted.
 */
export function parseSkillMarkdown(markdown: string): SkillCreateInput | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!match) return null;

  const frontmatter = match[1] ?? '';
  const content = (match[2] ?? '').replace(/^\n/, '');

  const nameMatch =
    /^name:\s*"((?:[^"\\]|\\.)*)"\s*$/m.exec(frontmatter) ??
    /^name:\s*'((?:[^'\\]|\\.)*)'\s*$/m.exec(frontmatter) ??
    /^name:\s*(.+?)\s*$/m.exec(frontmatter);

  const descMatch =
    /^description:\s*"((?:[^"\\]|\\.)*)"\s*$/m.exec(frontmatter) ??
    /^description:\s*'((?:[^'\\]|\\.)*)'\s*$/m.exec(frontmatter) ??
    /^description:\s*(.+?)\s*$/m.exec(frontmatter);

  const name = nameMatch?.[1]?.replace(/\\"/g, '"').replace(/\\'/g, "'").trim();
  const description = descMatch?.[1]?.replace(/\\"/g, '"').replace(/\\'/g, "'").trim();

  if (!name || !description) return null;
  return { name, description, content };
}
