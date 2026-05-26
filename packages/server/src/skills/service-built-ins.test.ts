import { describe, expect, test } from 'bun:test';

import { getDb } from '@/db/client.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { skills } from '@/db/schema.js';
import { buildSkillsSystemPrompt, syncBuiltInSkills } from '@/skills/service.js';

setupTestDb();

describe('syncBuiltInSkills', () => {
  test('inserts missing built-in skills', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'Use this test skill.',
        content: 'Test instructions.',
      },
    ]);

    const rows = await getDb().select().from(skills);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'test-skill',
      description: 'Use this test skill.',
      content: 'Test instructions.',
      isExternal: false,
      source: 'builtin:test-skill',
    });
  });

  test('updates existing skills when content changes', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'Old description.',
        content: 'Old instructions.',
      },
    ]);

    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'New description.',
        content: 'New instructions.',
      },
    ]);

    const rows = await getDb().select().from(skills);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      description: 'New description.',
      content: 'New instructions.',
      source: 'builtin:test-skill',
      isExternal: false,
    });
  });

  test('does not update unchanged built-in skills', async () => {
    const skill = {
      name: 'test-skill',
      description: 'Use this test skill.',
      content: 'Test instructions.',
    };

    await syncBuiltInSkills([skill]);
    const [before] = await getDb().select().from(skills);

    await syncBuiltInSkills([skill]);
    const [after] = await getDb().select().from(skills);

    expect(after!.updatedAt).toBe(before!.updatedAt);
  });
});

describe('buildSkillsSystemPrompt', () => {
  test('includes skills from the database', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'Use this test skill.',
        content: 'Test instructions.',
      },
    ]);

    const prompt = await buildSkillsSystemPrompt();
    expect(prompt).toContain('- test-skill: Use this test skill.');
  });

  test('returns empty string when no skills exist', async () => {
    const prompt = await buildSkillsSystemPrompt();
    expect(prompt).toBe('');
  });
});
