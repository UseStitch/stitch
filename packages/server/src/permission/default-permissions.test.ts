import { describe, expect, test } from 'bun:test';
import path from 'node:path';

import { getDb } from '@/db/client.js';
import { toolPermissions } from '@/db/schema/permissions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { PATHS } from '@/lib/paths.js';
import { syncDefaultPermissions } from '@/permission/default-permissions.js';

setupTestDb();

describe('syncDefaultPermissions', () => {
  test('creates read permission for skills directory', async () => {
    await syncDefaultPermissions();

    const rows = await getDb().select().from(toolPermissions);
    const skillsRule = rows.find(
      (r) => r.toolName === 'read' && r.pattern === `${PATHS.dirPaths.skills}${path.sep}*`,
    );

    expect(skillsRule).toBeDefined();
    expect(skillsRule!.permission).toBe('allow');
  });

  test('is idempotent', async () => {
    await syncDefaultPermissions();
    await syncDefaultPermissions();

    const rows = await getDb().select().from(toolPermissions);
    const skillsRules = rows.filter(
      (r) => r.toolName === 'read' && r.pattern === `${PATHS.dirPaths.skills}${path.sep}*`,
    );

    expect(skillsRules).toHaveLength(1);
  });
});
