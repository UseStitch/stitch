import { describe, expect, test } from 'bun:test';

import { getBuiltInSkillSource, loadBuiltInSkills } from '@/skills/built-in-skills.js';

describe('loadBuiltInSkills', () => {
  test('loads skills from markdown files', async () => {
    const skills = await loadBuiltInSkills([
      {
        sourceUrl: new URL('./__test__/test-skill.md', import.meta.url),
        bundledPath: 'unused-in-tests/test-skill.md',
      },
    ]);

    expect(skills).toEqual([
      {
        name: 'test-skill',
        description: 'Use this test skill in loader tests.',
        content: 'These are test skill instructions.',
      },
    ]);
  });

  test('rejects duplicate skill names', async () => {
    const file = {
      sourceUrl: new URL('./__test__/test-skill.md', import.meta.url),
      bundledPath: 'unused-in-tests/test-skill.md',
    };

    expect(loadBuiltInSkills([file, file])).rejects.toThrow(
      'Duplicate built-in skill name: test-skill',
    );
  });
});

describe('getBuiltInSkillSource', () => {
  test('builds stable source keys', () => {
    expect(getBuiltInSkillSource('test-skill')).toBe('builtin:test-skill');
  });
});
