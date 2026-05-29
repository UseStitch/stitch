import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getDb } from '@/db/client.js';
import { skillMetadata } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { PATHS } from '@/lib/paths.js';
import { buildSkillsSystemPrompt, syncBuiltInSkills } from '@/skills/service.js';

let tempDir: string;
let originalSkillsDir: string;

setupTestDb();

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-skills-test-'));
  originalSkillsDir = PATHS.dirPaths.skills;
  (PATHS.dirPaths as { skills: string }).skills = tempDir;
});

afterEach(async () => {
  (PATHS.dirPaths as { skills: string }).skills = originalSkillsDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('syncBuiltInSkills', () => {
  test('inserts missing built-in skills', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'Use this test skill.',
        content: 'Test instructions.',
      },
    ]);

    const rows = await getDb().select().from(skillMetadata);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'test-skill',
      isExternal: false,
      source: 'builtin:test-skill',
    });

    const mdPath = path.join(tempDir, 'test-skill', 'SKILL.md');
    const content = await fs.readFile(mdPath, 'utf8');
    expect(content).toContain('name: test-skill');
    expect(content).toContain('Test instructions.');
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

    const rows = await getDb().select().from(skillMetadata);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'test-skill',
      source: 'builtin:test-skill',
      isExternal: false,
    });

    const mdPath = path.join(tempDir, 'test-skill', 'SKILL.md');
    const content = await fs.readFile(mdPath, 'utf8');
    expect(content).toContain('New description.');
    expect(content).toContain('New instructions.');
  });

  test('does not update unchanged built-in skills', async () => {
    const skill = {
      name: 'test-skill',
      description: 'Use this test skill.',
      content: 'Test instructions.',
    };

    await syncBuiltInSkills([skill]);
    const [before] = await getDb().select().from(skillMetadata);

    await syncBuiltInSkills([skill]);
    const [after] = await getDb().select().from(skillMetadata);

    expect(after.updatedAt).toBe(before.updatedAt);
  });
});

describe('buildSkillsSystemPrompt', () => {
  test('includes skills from the filesystem', async () => {
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
