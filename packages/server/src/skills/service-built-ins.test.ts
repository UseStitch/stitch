import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Skill } from '@stitch/shared/skills/types';

import { getDb } from '@/db/client.js';
import { skills } from '@/db/schema/skills.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { PATHS } from '@/lib/paths.js';
import * as skillsService from '@/skills/service.js';
import { getToolEnabledStates, setToolEnabledState } from '@/tools/enabled-service.js';

const {
  buildSkillsSystemPrompt,
  createSkill,
  deleteSkill,
  getSkillByName,
  listSkills,
  syncBuiltInSkills,
  updateSkill,
} = skillsService;

let tempDir: string;
let originalSkillsDir: string;

setupTestDb();

function skillInput(name: string) {
  return { name, description: `Use ${name}.`, content: `Instructions for ${name}.` };
}

function skillMarkdown(name: string): string {
  const input = skillInput(name);
  return `---\nname: ${input.name}\ndescription: ${input.description}\n---\n\n${input.content}`;
}

function skillPath(name: string): string {
  return path.join(tempDir, name, 'SKILL.md');
}

async function disableSkill(name: string): Promise<void> {
  await setToolEnabledState({ scope: 'skill', identifier: name, enabled: false });
}

async function createExternalSkill(name: string): Promise<void> {
  await fs.mkdir(path.join(tempDir, name), { recursive: true });
  await fs.writeFile(skillPath(name), skillMarkdown(name));
  await getDb().insert(skills).values({ name, type: 'external' });
  await disableSkill(name);
  await fs.mkdir(path.join(tempDir, name, 'references'));
  await fs.writeFile(path.join(tempDir, name, 'references', 'guide.md'), 'Keep this companion file.');
}

async function expectDisabledRegistration(name: string): Promise<void> {
  expect(await getToolEnabledStates()).toContainEqual({ scope: 'skill', identifier: name, enabled: false });
}

async function expectRenamedSkill(previousName: string, name: string): Promise<void> {
  const expected: Skill = {
    ...skillInput(name),
    type: 'external',
    enabled: false,
    location: skillPath(name),
    files: ['references/guide.md'],
  };
  expect(await listSkills()).toEqual([expected]);
  expect(await getSkillByName(name)).toEqual(expected);
  expect(getSkillByName(previousName)).rejects.toMatchObject({ status: 404 });
  expect(await fs.readFile(skillPath(name), 'utf8')).toBe(skillMarkdown(name));
  expect(await fs.readFile(path.join(tempDir, name, 'references', 'guide.md'), 'utf8')).toBe(
    'Keep this companion file.',
  );
  expect(await fs.readdir(tempDir)).toEqual([name]);
  expect(await getToolEnabledStates()).toEqual([{ scope: 'skill', identifier: name, enabled: false }]);
  expect(await buildSkillsSystemPrompt()).toBe('');
}

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
      { name: 'test-skill', description: 'Use this test skill.', content: 'Test instructions.', files: [] },
    ]);

    const mdPath = path.join(tempDir, 'test-skill', 'SKILL.md');
    const content = await fs.readFile(mdPath, 'utf8');
    expect(content).toContain('name: test-skill');
    expect(content).toContain('Test instructions.');
  });

  test('overwrites existing built-in skill instructions', async () => {
    const skill = {
      name: 'test-skill',
      description: 'Use this test skill.',
      content: 'Original instructions.',
      files: [],
    };

    await syncBuiltInSkills([skill]);

    const mdPath = path.join(tempDir, 'test-skill', 'SKILL.md');
    await fs.writeFile(mdPath, 'user modified content', 'utf8');

    await syncBuiltInSkills([{ ...skill, content: 'New instructions.' }]);

    const content = await fs.readFile(mdPath, 'utf8');
    expect(content).toContain('New instructions.');
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

  test('overwrites companion files for existing built-in skills', async () => {
    const skill = {
      name: 'test-skill',
      description: 'A skill.',
      content: 'Instructions.',
      files: [{ relativePath: 'references/guide.md', content: 'original' }],
    };

    await syncBuiltInSkills([skill]);

    await syncBuiltInSkills([{ ...skill, files: [{ relativePath: 'references/guide.md', content: 'updated' }] }]);

    const guidePath = path.join(tempDir, 'test-skill', 'references', 'guide.md');
    expect(await fs.readFile(guidePath, 'utf8')).toBe('updated');
  });
});

describe('installed skill policy', () => {
  test('listing a corrupt disabled skill preserves its policy when repaired through updateSkill', async () => {
    const name = 'disabled-skill';
    await createSkill(skillInput(name));
    await disableSkill(name);
    await fs.writeFile(skillPath(name), 'not valid frontmatter');

    expect(await listSkills()).toEqual([]);
    await expectDisabledRegistration(name);
    expect(await buildSkillsSystemPrompt()).toBe('');

    expect(await updateSkill(name, skillInput(name))).toMatchObject({ name, type: 'custom', enabled: false });
    expect(await getSkillByName(name)).toMatchObject({ name, type: 'custom', enabled: false });
    expect(await listSkills()).toMatchObject([{ name, type: 'custom', enabled: false }]);
    expect(await buildSkillsSystemPrompt()).toBe('');
  });

  test.each(['malformed', 'unreadable', 'missing'] as const)(
    'a %s built-in keeps its registration, disablement and read-only policy',
    async (damage) => {
      const name = 'protected-skill';
      await syncBuiltInSkills([{ ...skillInput(name), files: [] }]);
      await disableSkill(name);
      if (damage === 'malformed') {
        await fs.writeFile(skillPath(name), 'not valid frontmatter');
      } else {
        await fs.rm(skillPath(name));
        if (damage === 'unreadable') await fs.mkdir(skillPath(name));
      }

      expect(await listSkills()).toEqual([]);
      await expectDisabledRegistration(name);
      expect(await buildSkillsSystemPrompt()).toBe('');
      expect(updateSkill(name, skillInput(name))).rejects.toMatchObject({ status: 403 });
      expect(updateSkill(name, skillInput('renamed-skill'))).rejects.toMatchObject({ status: 403 });
      expect(deleteSkill(name)).rejects.toMatchObject({ status: 403 });
      expect(await fs.readdir(tempDir)).toEqual([name]);

      await fs.rm(skillPath(name), { recursive: true, force: true });
      await fs.writeFile(skillPath(name), skillMarkdown(name));
      expect(await getSkillByName(name)).toMatchObject({ name, type: 'stitch', enabled: false });
      expect(await listSkills()).toMatchObject([{ name, type: 'stitch', enabled: false }]);
      expect(await buildSkillsSystemPrompt()).toBe('');
    },
  );

  test('a missing external SKILL.md preserves policy until the file returns', async () => {
    const name = 'external-skill';
    await createExternalSkill(name);
    await fs.rm(skillPath(name));

    expect(await listSkills()).toEqual([]);
    await expectDisabledRegistration(name);
    await fs.writeFile(skillPath(name), skillMarkdown(name));

    expect(await getSkillByName(name)).toMatchObject({ name, type: 'external', enabled: false });
    expect(await listSkills()).toMatchObject([{ name, type: 'external', enabled: false }]);
    expect(await buildSkillsSystemPrompt()).toBe('');
  });

  test('a deleted directory removes stale registration before the name is reused', async () => {
    const name = 'removed-skill';
    await syncBuiltInSkills([{ ...skillInput(name), files: [] }]);
    await disableSkill(name);
    await fs.rm(path.join(tempDir, name), { recursive: true });

    expect(await listSkills()).toEqual([]);
    expect(await getToolEnabledStates()).toEqual([]);
    expect(await createSkill(skillInput(name))).toMatchObject({ name, type: 'custom', enabled: true });
    expect(await getSkillByName(name)).toMatchObject({ name, type: 'custom', enabled: true });
    await deleteSkill(name);
    expect(await listSkills()).toEqual([]);
    expect(await getToolEnabledStates()).toEqual([]);
  });

  test('directory identity controls name, location and policy despite conflicting frontmatter', async () => {
    const name = 'protected-skill';
    const alias = 'other-skill';
    await syncBuiltInSkills([{ ...skillInput(name), files: [] }]);
    const other = await createSkill(skillInput(alias));
    await disableSkill(name);
    await fs.writeFile(skillPath(name), skillMarkdown(alias));

    const expected: Skill = {
      ...skillInput(alias),
      name,
      location: skillPath(name),
      type: 'stitch',
      enabled: false,
      files: [],
    };
    expect(await getSkillByName(name)).toEqual(expected);
    expect(await listSkills()).toEqual([other, expected]);
    expect(await getSkillByName(alias)).toEqual(other);
    await expectDisabledRegistration(name);
    expect(updateSkill(name, skillInput(name))).rejects.toMatchObject({ status: 403 });
    expect(deleteSkill(name)).rejects.toMatchObject({ status: 403 });

    await setToolEnabledState({ scope: 'skill', identifier: name, enabled: true });
    expect(await buildSkillsSystemPrompt()).toContain(`- ${name}: Use ${alias}.`);
    expect(await getSkillByName(name)).toMatchObject({
      name,
      location: skillPath(name),
      type: 'stitch',
      enabled: true,
    });
  });

  test('built-in sync repairs corrupt markdown and refreshes files without enabling the skill', async () => {
    const name = 'protected-skill';
    await syncBuiltInSkills([
      { ...skillInput(name), files: [{ relativePath: 'references/guide.md', content: 'Original guide.' }] },
    ]);
    await disableSkill(name);
    await fs.writeFile(skillPath(name), 'not valid frontmatter');

    await syncBuiltInSkills([
      {
        ...skillInput(name),
        content: 'Updated instructions.',
        files: [{ relativePath: 'references/guide.md', content: 'Updated guide.' }],
      },
    ]);

    expect(await getSkillByName(name)).toMatchObject({
      name,
      type: 'stitch',
      enabled: false,
      content: 'Updated instructions.',
    });
    await expectDisabledRegistration(name);
    expect(await fs.readFile(path.join(tempDir, name, 'references', 'guide.md'), 'utf8')).toBe('Updated guide.');
    expect(await buildSkillsSystemPrompt()).toBe('');
  });
});

describe('skill rename policy and recovery', () => {
  test('renaming a disabled external skill preserves policy and companion files', async () => {
    await createExternalSkill('original-skill');

    expect(await updateSkill('original-skill', skillInput('renamed-skill'))).toMatchObject({
      name: 'renamed-skill',
      type: 'external',
      enabled: false,
      files: ['references/guide.md'],
    });

    await expectRenamedSkill('original-skill', 'renamed-skill');
  });

  test('a rename collision leaves both identities, policies and files unchanged', async () => {
    await createExternalSkill('original-skill');
    await createSkill(skillInput('occupied-skill'));
    const original = await getSkillByName('original-skill');
    const occupied = await getSkillByName('occupied-skill');
    const states = await getToolEnabledStates();

    expect(updateSkill('original-skill', skillInput('occupied-skill'))).rejects.toMatchObject({ status: 409 });

    expect(await getSkillByName('original-skill')).toEqual(original);
    expect(await getSkillByName('occupied-skill')).toEqual(occupied);
    expect(await listSkills()).toEqual([occupied, original]);
    expect(await getToolEnabledStates()).toEqual(states);
    expect(await fs.readFile(skillPath('original-skill'), 'utf8')).toBe(skillMarkdown('original-skill'));
    expect(await fs.readFile(skillPath('occupied-skill'), 'utf8')).toBe(skillMarkdown('occupied-skill'));
    expect(await fs.readFile(path.join(tempDir, 'original-skill', 'references', 'guide.md'), 'utf8')).toBe(
      'Keep this companion file.',
    );
    expect((await fs.readdir(tempDir)).toSorted()).toEqual(['occupied-skill', 'original-skill']);
  });

  test('a failed markdown write is durably recovered by listing after the obstruction is removed', async () => {
    await createExternalSkill('original-skill');
    await fs.rm(skillPath('original-skill'));
    await fs.mkdir(skillPath('original-skill'));

    expect(updateSkill('original-skill', skillInput('renamed-skill'))).rejects.toThrow();

    expect(JSON.parse(await fs.readFile(path.join(tempDir, '.rename.json'), 'utf8'))).toMatchObject({
      previousName: 'original-skill',
      name: 'renamed-skill',
      markdown: skillMarkdown('renamed-skill'),
      registration: { type: 'external', enabled: false },
    });
    await fs.rm(skillPath('original-skill'), { recursive: true, force: true });
    await fs.rm(skillPath('renamed-skill'), { recursive: true, force: true });

    await expectRenamedSkill('original-skill', 'renamed-skill');
    await expectRenamedSkill('original-skill', 'renamed-skill');
  });

  test('a failed database rename is recovered to the disabled target identity on the next list', async () => {
    await createExternalSkill('original-skill');
    getDb().run(sql`
      CREATE TRIGGER fail_skill_rename
      BEFORE UPDATE OF name ON skills
      WHEN OLD.name = 'original-skill'
      BEGIN
        SELECT RAISE(ABORT, 'forced skill rename failure');
      END
    `);

    try {
      expect(updateSkill('original-skill', skillInput('renamed-skill'))).rejects.toThrow();
      expect(JSON.parse(await fs.readFile(path.join(tempDir, '.rename.json'), 'utf8'))).toMatchObject({
        previousName: 'original-skill',
        name: 'renamed-skill',
        markdown: skillMarkdown('renamed-skill'),
        registration: { type: 'external', enabled: false },
      });
    } finally {
      getDb().run(sql`DROP TRIGGER fail_skill_rename`);
    }

    await expectRenamedSkill('original-skill', 'renamed-skill');
    await expectRenamedSkill('original-skill', 'renamed-skill');
  });

  test.each([false, true])('listing resumes a durable journal when the directory has moved: %s', async (moved) => {
    await createExternalSkill('original-skill');
    const { dev, ino } = await fs.lstat(path.join(tempDir, 'original-skill'));
    await fs.writeFile(
      path.join(tempDir, '.rename.json'),
      JSON.stringify({
        directory: { dev, ino },
        previousName: 'original-skill',
        name: 'renamed-skill',
        markdown: skillMarkdown('renamed-skill'),
        registration: { type: 'external', enabled: false },
      }),
    );
    if (moved) await fs.rename(path.join(tempDir, 'original-skill'), path.join(tempDir, 'renamed-skill'));

    await expectRenamedSkill('original-skill', 'renamed-skill');
    await expectRenamedSkill('original-skill', 'renamed-skill');
  });
});

describe('skill loading availability', () => {
  test('enabled skills can be loaded and advertised while management access stays available', async () => {
    const skill = await createSkill(skillInput('available-skill'));

    expect(typeof skillsService.loadSkill).toBe('function');
    expect(await skillsService.loadSkill(skill.name)).toEqual(skill);
    expect(await buildSkillsSystemPrompt()).toContain(`- ${skill.name}: ${skill.description}`);
    expect(await getSkillByName(skill.name)).toEqual(skill);
  });

  test.each(['disabled', 'malformed', 'unreadable', 'missing', 'app-disabled'] as const)(
    'loadSkill and the prompt both exclude a skill that is %s',
    async (state) => {
      const name = state === 'app-disabled' ? 'browser-automation' : 'unavailable-skill';
      const skill = await createSkill(skillInput(name));
      const available = await createSkill(skillInput('available-skill'));
      const markdown = await fs.readFile(skillPath(name), 'utf8');
      if (state === 'disabled') {
        await disableSkill(name);
      } else if (state === 'app-disabled') {
        await setToolEnabledState({ scope: 'app', identifier: 'browser', enabled: false });
      } else if (state === 'malformed') {
        await fs.writeFile(skillPath(name), 'not valid frontmatter');
      } else {
        await fs.rm(skillPath(name));
        if (state === 'unreadable') await fs.mkdir(skillPath(name));
      }

      expect(typeof skillsService.loadSkill).toBe('function');
      expect(skillsService.loadSkill(name)).rejects.toThrow();
      const prompt = await buildSkillsSystemPrompt();
      expect(prompt).not.toContain(`- ${name}:`);
      expect(prompt).toContain(`- ${available.name}: ${available.description}`);
      expect(skillsService.loadSkill(name)).rejects.toThrow();
      expect(await skillsService.loadSkill(available.name)).toEqual(available);

      if (state === 'disabled') {
        expect(await getSkillByName(name)).toEqual({ ...skill, enabled: false });
        expect(await listSkills()).toContainEqual({ ...skill, enabled: false });
        await setToolEnabledState({ scope: 'skill', identifier: name, enabled: true });
      } else if (state === 'app-disabled') {
        expect(await getSkillByName(name)).toEqual(skill);
        expect(await listSkills()).toContainEqual(skill);
        await setToolEnabledState({ scope: 'app', identifier: 'browser', enabled: true });
      } else {
        await fs.rm(skillPath(name), { recursive: true, force: true });
        await fs.writeFile(skillPath(name), markdown);
      }

      expect(await skillsService.loadSkill(name)).toEqual(skill);
      expect(await buildSkillsSystemPrompt()).toContain(`- ${name}: ${skill.description}`);
    },
  );

  test('frontmatter cannot bypass app or skill disablement under the directory identity', async () => {
    const name = 'browser-automation';
    const alias = 'unregistered-alias';
    await createSkill(skillInput(name));
    await fs.writeFile(skillPath(name), skillMarkdown(alias));
    await setToolEnabledState({ scope: 'app', identifier: 'browser', enabled: false });

    expect(typeof skillsService.loadSkill).toBe('function');
    expect(await buildSkillsSystemPrompt()).toBe('');
    expect(skillsService.loadSkill(name)).rejects.toThrow();
    expect(skillsService.loadSkill(alias)).rejects.toThrow();
    expect(await getSkillByName(name)).toMatchObject({ name, location: skillPath(name), enabled: true });

    await setToolEnabledState({ scope: 'app', identifier: 'browser', enabled: true });
    await disableSkill(name);
    expect(await buildSkillsSystemPrompt()).toBe('');
    expect(skillsService.loadSkill(name)).rejects.toThrow();
    expect(await getSkillByName(name)).toMatchObject({ name, location: skillPath(name), enabled: false });

    await setToolEnabledState({ scope: 'skill', identifier: name, enabled: true });
    expect(await skillsService.loadSkill(name)).toMatchObject({ name, location: skillPath(name), enabled: true });
    expect(await buildSkillsSystemPrompt()).toContain(`- ${name}: Use ${alias}.`);
    expect(await buildSkillsSystemPrompt()).not.toContain(`- ${alias}:`);
  });

  test('an absent directory cannot be loaded or advertised', async () => {
    expect(typeof skillsService.loadSkill).toBe('function');
    expect(skillsService.loadSkill('absent-skill')).rejects.toThrow();
    expect(await buildSkillsSystemPrompt()).toBe('');
  });
});

describe('buildSkillsSystemPrompt', () => {
  test('includes skills from the filesystem', async () => {
    await syncBuiltInSkills([
      { name: 'test-skill', description: 'Use this test skill.', content: 'Test instructions.', files: [] },
    ]);

    const prompt = await buildSkillsSystemPrompt();
    expect(prompt).toContain('- test-skill: Use this test skill.');
  });

  test('returns empty string when no skills exist', async () => {
    const prompt = await buildSkillsSystemPrompt();
    expect(prompt).toBe('');
  });
});
