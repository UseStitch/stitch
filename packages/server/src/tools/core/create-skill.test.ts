import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PATHS } from '@/lib/paths.js';
import { createSkillFromTool } from '@/tools/core/create-skill.js';

let tempDir: string;
let originalSkillsDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stitch-create-skill-tool-'));
  originalSkillsDir = PATHS.dirPaths.skills;
  (PATHS.dirPaths as { skills: string }).skills = tempDir;
});

afterEach(async () => {
  (PATHS.dirPaths as { skills: string }).skills = originalSkillsDir;
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('createSkillFromTool', () => {
  test('creates a managed skill file', async () => {
    const result = await createSkillFromTool({
      name: 'release-flow',
      description: 'Run the release flow.',
      content: '# Release Flow\n\nDo the release.',
    });

    expect(result).toMatchObject({
      name: 'release-flow',
      description: 'Run the release flow.',
    });
    expect(await fs.readFile(path.join(tempDir, 'release-flow', 'SKILL.md'), 'utf8')).toContain(
      '# Release Flow',
    );
  });

  test('returns an error when the skill already exists', async () => {
    const input = {
      name: 'release-flow',
      description: 'Run the release flow.',
      content: '# Release Flow\n\nDo the release.',
    };

    await createSkillFromTool(input);
    const result = await createSkillFromTool(input);

    expect(result).toMatchObject({ error: 'Skill name "release-flow" already exists' });
  });
});
