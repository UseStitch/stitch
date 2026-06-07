import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PATHS } from '@/lib/paths.js';
import { buildSkillsSystemPrompt, syncBuiltInSkills } from '@/skills/service.js';

let tempDir: string;
let originalSkillsDir: string;

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
  test('writes missing built-in skills to disk', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'Use this test skill.',
        content: 'Test instructions.',
        files: [],
      },
    ]);

    const mdPath = path.join(tempDir, 'test-skill', 'SKILL.md');
    const content = await fs.readFile(mdPath, 'utf8');
    expect(content).toContain('name: test-skill');
    expect(content).toContain('Test instructions.');
  });

  test('skips existing skill directories', async () => {
    const skill = {
      name: 'test-skill',
      description: 'Use this test skill.',
      content: 'Original instructions.',
      files: [],
    };

    await syncBuiltInSkills([skill]);

    // Manually modify the file to simulate a user edit
    const mdPath = path.join(tempDir, 'test-skill', 'SKILL.md');
    await fs.writeFile(mdPath, 'user modified content', 'utf8');

    await syncBuiltInSkills([{ ...skill, content: 'New instructions.' }]);

    // File should remain as the user left it
    const content = await fs.readFile(mdPath, 'utf8');
    expect(content).toBe('user modified content');
  });

  test('syncs companion files for new skills', async () => {
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

  test('does not write companion files for existing skill directories', async () => {
    const skill = {
      name: 'test-skill',
      description: 'A skill.',
      content: 'Instructions.',
      files: [{ relativePath: 'references/guide.md', content: 'original' }],
    };

    await syncBuiltInSkills([skill]);

    await syncBuiltInSkills([
      { ...skill, files: [{ relativePath: 'references/guide.md', content: 'updated' }] },
    ]);

    const guidePath = path.join(tempDir, 'test-skill', 'references', 'guide.md');
    expect(await fs.readFile(guidePath, 'utf8')).toBe('original');
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

  test('does not write skills that already exist', async () => {
    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'Use this test skill.',
        content: 'Test instructions.',
        files: [],
      },
    ]);

    expect(existsSync(path.join(tempDir, 'test-skill'))).toBe(true);
  });
});
