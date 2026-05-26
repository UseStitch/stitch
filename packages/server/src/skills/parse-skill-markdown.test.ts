import { describe, expect, it } from 'bun:test';

import { parseSkillMarkdown } from '@/skills/parse-skill-markdown.js';

describe('parseSkillMarkdown', () => {
  it('parses bare (unquoted) name and description', () => {
    const md = `---\nname: my-skill\ndescription: Does something useful\n---\n# Body\n`;
    const result = parseSkillMarkdown(md);
    expect(result).toEqual({
      name: 'my-skill',
      description: 'Does something useful',
      content: '# Body\n',
    });
  });

  it('parses double-quoted name and description', () => {
    const md = `---\nname: "my-skill"\ndescription: "Does something useful"\n---\nBody\n`;
    const result = parseSkillMarkdown(md);
    expect(result).toEqual({
      name: 'my-skill',
      description: 'Does something useful',
      content: 'Body\n',
    });
  });

  it('parses single-quoted name and description', () => {
    const md = `---\nname: 'my-skill'\ndescription: 'Does something useful'\n---\nBody\n`;
    const result = parseSkillMarkdown(md);
    expect(result).toEqual({
      name: 'my-skill',
      description: 'Does something useful',
      content: 'Body\n',
    });
  });

  it('unescapes \\\" inside double-quoted description (real skills.sh case)', () => {
    const md = `---\nname: grill-me\ndescription: "Interview the user relentlessly until reaching shared understanding, resolving each branch. Use when user wants to \\"grill me\\"."\n---\n\nBody\n`;
    const result = parseSkillMarkdown(md);
    expect(result?.description).toContain('"grill me"');
    expect(result?.name).toBe('grill-me');
  });

  it('parses description with colon in bare value', () => {
    const md = `---\nname: my-skill\ndescription: Use this skill: it does things\n---\n\nBody\n`;
    const result = parseSkillMarkdown(md);
    expect(result?.description).toBe('Use this skill: it does things');
  });

  it('parses description with double-quote characters in bare value', () => {
    const md = `---\nname: grill-me\ndescription: Interview until "shared understanding" is reached\n---\n\nBody\n`;
    const result = parseSkillMarkdown(md);
    expect(result?.description).toBe('Interview until "shared understanding" is reached');
  });

  it('preserves multiline body content', () => {
    const md = `---\nname: my-skill\ndescription: A skill\n---\n# Step 1\n\nDo a thing.\n\n# Step 2\n\nDo another thing.\n`;
    const result = parseSkillMarkdown(md);
    expect(result?.content).toBe('# Step 1\n\nDo a thing.\n\n# Step 2\n\nDo another thing.\n');
  });

  it('handles CRLF line endings', () => {
    const md = `---\r\nname: my-skill\r\ndescription: A skill\r\n---\r\n\r\nBody\r\n`;
    const result = parseSkillMarkdown(md);
    expect(result?.name).toBe('my-skill');
    expect(result?.description).toBe('A skill');
  });

  it('returns null when frontmatter block is missing', () => {
    expect(parseSkillMarkdown('# No frontmatter\n\nJust a body.')).toBeNull();
  });

  it('returns null when name is missing', () => {
    const md = `---\ndescription: A skill\n---\n\nBody\n`;
    expect(parseSkillMarkdown(md)).toBeNull();
  });

  it('returns null when description is missing', () => {
    const md = `---\nname: my-skill\n---\n\nBody\n`;
    expect(parseSkillMarkdown(md)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseSkillMarkdown('')).toBeNull();
  });

  it('parses content as empty string when body is absent', () => {
    const md = `---\nname: my-skill\ndescription: A skill\n---\n`;
    const result = parseSkillMarkdown(md);
    expect(result?.content).toBe('');
  });
});
