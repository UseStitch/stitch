import path from 'node:path';

import type { ToolPermissionValue } from '@stitch/shared/permissions/types';

import { PATHS } from '@/lib/paths.js';
import { upsertPerm } from '@/permission/service.js';

type DefaultPermissionRule = {
  toolName: string;
  permission: ToolPermissionValue;
  pattern: string;
};

function getDefaultPermissionRules(): DefaultPermissionRule[] {
  return [
    {
      toolName: 'read',
      permission: 'allow',
      pattern: `${PATHS.dirPaths.skills}${path.sep}*`,
    },
  ];
}

export async function syncDefaultPermissions(): Promise<void> {
  const rules = getDefaultPermissionRules();
  await Promise.all(rules.map((rule) => upsertPerm(rule)));
}
