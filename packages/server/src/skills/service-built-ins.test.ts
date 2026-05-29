import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
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
        files: [],
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
        files: [],
      },
    ]);

    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'New description.',
        content: 'New instructions.',
        files: [],
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
      files: [],
    };

    await syncBuiltInSkills([skill]);
    const [before] = await getDb().select().from(skillMetadata);

    await syncBuiltInSkills([skill]);
    const [after] = await getDb().select().from(skillMetadata);

    expect(after.updatedAt).toBe(before.updatedAt);
  });

  test('syncs companion files to the skill directory', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'A skill with references.',
        content: 'Instructions here.',
        files: [
          { relativePath: 'references/guide.md', content: '# Guide\n\nSome guide.' },
          { relativePath: 'agents/helper.md', content: '# Helper agent' },
          { relativePath: 'scripts/run.py', content: 'print("hello")' },
        ],
      },
    ]);

    const guidePath = path.join(tempDir, 'test-skill', 'references', 'guide.md');
    const agentPath = path.join(tempDir, 'test-skill', 'agents', 'helper.md');
    const scriptPath = path.join(tempDir, 'test-skill', 'scripts', 'run.py');

    expect(await fs.readFile(guidePath, 'utf8')).toBe('# Guide\n\nSome guide.');
    expect(await fs.readFile(agentPath, 'utf8')).toBe('# Helper agent');
    expect(await fs.readFile(scriptPath, 'utf8')).toBe('print("hello")');
  });

  test('updates changed companion files', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'A skill.',
        content: 'Instructions.',
        files: [{ relativePath: 'references/guide.md', content: 'Version 1' }],
      },
    ]);

    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'A skill.',
        content: 'Instructions.',
        files: [{ relativePath: 'references/guide.md', content: 'Version 2' }],
      },
    ]);

    const guidePath = path.join(tempDir, 'test-skill', 'references', 'guide.md');
    expect(await fs.readFile(guidePath, 'utf8')).toBe('Version 2');
  });

  test('removes stale companion files from built-in skills', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'A skill.',
        content: 'Instructions.',
        files: [
          { relativePath: 'references/old.md', content: 'old content' },
          { relativePath: 'references/keep.md', content: 'keep this' },
        ],
      },
    ]);

    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'A skill.',
        content: 'Instructions.',
        files: [{ relativePath: 'references/keep.md', content: 'keep this' }],
      },
    ]);

    const oldPath = path.join(tempDir, 'test-skill', 'references', 'old.md');
    const keepPath = path.join(tempDir, 'test-skill', 'references', 'keep.md');

    expect(existsSync(oldPath)).toBe(false);
    expect(existsSync(keepPath)).toBe(true);
  });

  test('removes empty directories after stale file removal', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'A skill.',
        content: 'Instructions.',
        files: [{ relativePath: 'agents/old-agent.md', content: 'agent content' }],
      },
    ]);

    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'A skill.',
        content: 'Instructions.',
        files: [],
      },
    ]);

    const agentsDir = path.join(tempDir, 'test-skill', 'agents');
    expect(existsSync(agentsDir)).toBe(false);
  });

  test('does not update when companion files are unchanged', async () => {
    const skill = {
      name: 'test-skill',
      description: 'A skill.',
      content: 'Instructions.',
      files: [{ relativePath: 'references/guide.md', content: 'stable content' }],
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
        files: [],
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
