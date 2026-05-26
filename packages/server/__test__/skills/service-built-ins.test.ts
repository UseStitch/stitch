import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, test, vi } from 'vitest';

function skillHash(skill: { name: string; description: string; content: string }): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        name: skill.name,
        description: skill.description,
        content: skill.content,
      }),
      'utf8',
    )
    .digest('hex');
}

const mocks = vi.hoisted(() => {
  const selectGetMock = vi.fn();
  const insertValuesMock = vi.fn();
  const updateWhereMock = vi.fn();
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const orderByMock = vi.fn();
  const whereMock = vi.fn(() => ({ get: selectGetMock }));
  const fromMock = vi.fn(() => ({ where: whereMock, orderBy: orderByMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const insertMock = vi.fn(() => ({ values: insertValuesMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));
  const getDbMock = vi.fn(() => ({
    insert: insertMock,
    select: selectMock,
    update: updateMock,
  }));
  const isDbInitializedMock = vi.fn(() => true);

  return {
    fromMock,
    getDbMock,
    insertValuesMock,
    isDbInitializedMock,
    orderByMock,
    selectGetMock,
    updateSetMock,
    updateWhereMock,
    whereMock,
  };
});

vi.mock('@/db/client.js', () => ({
  getDb: mocks.getDbMock,
  isDbInitialized: mocks.isDbInitializedMock,
}));

describe('syncBuiltInSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDbInitializedMock.mockReturnValue(true);
  });

  test('inserts missing built-in skills', async () => {
    const { syncBuiltInSkills } = await import('@/skills/service.js');
    mocks.selectGetMock.mockReturnValue(undefined);

    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'Use this test skill.',
        content: 'Test instructions.',
      },
    ]);

    expect(mocks.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'test-skill',
        description: 'Use this test skill.',
        content: 'Test instructions.',
        isExternal: false,
        source: 'builtin:test-skill',
      }),
    );
  });

  test('updates existing skills that match built-in names', async () => {
    const { syncBuiltInSkills } = await import('@/skills/service.js');
    mocks.selectGetMock.mockReturnValue({
      id: 'skill_existing',
      name: 'test-skill',
      description: 'Old description.',
      content: 'Old instructions.',
      hash: 'old-hash',
      isExternal: false,
      source: null,
      createdAt: 1,
      updatedAt: 1,
    });

    await syncBuiltInSkills([
      {
        name: 'test-skill',
        description: 'New description.',
        content: 'New instructions.',
      },
    ]);

    expect(mocks.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'New description.',
        content: 'New instructions.',
        isExternal: false,
        source: 'builtin:test-skill',
      }),
    );
  });

  test('does not update unchanged built-in skills', async () => {
    const { syncBuiltInSkills } = await import('@/skills/service.js');
    const skill = {
      name: 'test-skill',
      description: 'Use this test skill.',
      content: 'Test instructions.',
    };
    mocks.selectGetMock.mockReturnValue({
      id: 'skill_existing',
      ...skill,
      hash: skillHash(skill),
      isExternal: false,
      source: 'builtin:test-skill',
      createdAt: 1,
      updatedAt: 1,
    });

    await syncBuiltInSkills([skill]);

    expect(mocks.insertValuesMock).not.toHaveBeenCalled();
    expect(mocks.updateSetMock).not.toHaveBeenCalled();
  });
});

describe('buildSkillsSystemPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDbInitializedMock.mockReturnValue(true);
  });

  test('includes built-in skills from the database', async () => {
    const { buildSkillsSystemPrompt } = await import('@/skills/service.js');
    mocks.orderByMock.mockResolvedValue([
      {
        name: 'test-skill',
        description: 'Use this test skill.',
      },
    ]);

    await expect(buildSkillsSystemPrompt()).resolves.toContain(
      '- test-skill: Use this test skill.',
    );
  });
});
