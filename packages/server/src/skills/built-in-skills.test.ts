import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { loadBuiltInSkills } from '@/skills/built-in-skills.js';

const TEST_BUILT_INS_DIR = fileURLToPath(new URL('./__test__', import.meta.url));

describe('loadBuiltInSkills', () => {
  test('loads skills from directories containing SKILL.md', async () => {
    const skills = await loadBuiltInSkills(TEST_BUILT_INS_DIR);

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'test-skill',
      description: 'Use this test skill in loader tests.',
      content: 'These are test skill instructions.',
    });
  });

  test('returns empty array for nonexistent directory', async () => {
    const skills = await loadBuiltInSkills('/nonexistent/path');
    expect(skills).toEqual([]);
  });
});
