import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PATHS } from '@/lib/paths.js';
import {
  buildSkillMd,
  ensureSkillsDir,
  getSkillDir,
  getSkillMdPath,
  getSkillsDir,
  listSkillFiles,
  readSkillMdFile,
  writeSkillMdFile,
} from '@/skills/filesystem.js';

let tempDir: string;
let originalSkillsDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-skills-fs-test-'));
  originalSkillsDir = PATHS.dirPaths.skills;
  (PATHS.dirPaths as { skills: string }).skills = tempDir;
});

afterEach(async () => {
  (PATHS.dirPaths as { skills: string }).skills = originalSkillsDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('getSkillsDir', () => {
  test('returns the configured skills directory', () => {
    expect(getSkillsDir()).toBe(tempDir);
  });
});

describe('getSkillDir', () => {
  test('returns path with skill name appended', () => {
    expect(getSkillDir('my-skill')).toBe(path.join(tempDir, 'my-skill'));
  });
});

describe('getSkillMdPath', () => {
  test('returns SKILL.md path inside skill directory', () => {
    expect(getSkillMdPath('my-skill')).toBe(path.join(tempDir, 'my-skill', 'SKILL.md'));
  });
});

describe('ensureSkillsDir', () => {
  test('creates the skills directory if it does not exist', async () => {
    const nested = path.join(tempDir, 'nested', 'skills');
    (PATHS.dirPaths as { skills: string }).skills = nested;

    await ensureSkillsDir();

    const stat = await fs.stat(nested);
    expect(stat.isDirectory()).toBe(true);
  });

  test('does nothing if directory already exists', async () => {
    await ensureSkillsDir();
    await ensureSkillsDir();

    const stat = await fs.stat(tempDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('buildSkillMd', () => {
  test('creates valid SKILL.md content with frontmatter', () => {
    const result = buildSkillMd({
      name: 'test-skill',
      description: 'A test skill.',
      content: '# Instructions\n\nDo things.',
    });

    expect(result).toBe(
      '---\nname: test-skill\ndescription: A test skill.\n---\n\n# Instructions\n\nDo things.',
    );
  });
});

describe('writeSkillMdFile', () => {
  test('creates skill directory and writes SKILL.md', async () => {
    await writeSkillMdFile('new-skill', '---\nname: new-skill\ndescription: test\n---\n\nBody');

    const content = await fs.readFile(path.join(tempDir, 'new-skill', 'SKILL.md'), 'utf8');
    expect(content).toContain('name: new-skill');
    expect(content).toContain('Body');
  });
});

describe('readSkillMdFile', () => {
  test('returns content when SKILL.md exists', async () => {
    const skillDir = path.join(tempDir, 'existing-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'test content', 'utf8');

    const result = await readSkillMdFile('existing-skill');
    expect(result).toBe('test content');
  });

  test('returns null when SKILL.md does not exist', async () => {
    const result = await readSkillMdFile('nonexistent');
    expect(result).toBeNull();
  });
});

describe('listSkillFiles', () => {
  test('lists files excluding SKILL.md', async () => {
    const skillDir = path.join(tempDir, 'my-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'skill content', 'utf8');
    await fs.writeFile(path.join(skillDir, 'reference.ts'), 'code', 'utf8');

    const files = await listSkillFiles(skillDir);
    expect(files).toEqual(['reference.ts']);
  });

  test('lists nested files with relative paths', async () => {
    const skillDir = path.join(tempDir, 'my-skill');
    const subDir = path.join(skillDir, 'scripts');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'skill content', 'utf8');
    await fs.writeFile(path.join(subDir, 'helper.sh'), '#!/bin/bash', 'utf8');

    const files = await listSkillFiles(skillDir);
    expect(files).toContain(path.join('scripts', 'helper.sh'));
  });

  test('returns empty array when directory does not exist', async () => {
    const files = await listSkillFiles(path.join(tempDir, 'nonexistent'));
    expect(files).toEqual([]);
  });

  test('returns empty array when only SKILL.md exists', async () => {
    const skillDir = path.join(tempDir, 'my-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'content', 'utf8');

    const files = await listSkillFiles(skillDir);
    expect(files).toEqual([]);
  });
});
