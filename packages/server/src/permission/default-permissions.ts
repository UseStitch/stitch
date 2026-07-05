import path from 'node:path';

import type { ToolPermissionValue } from '@stitch/shared/permissions/types';

import { PATHS } from '@/lib/paths.js';
import { upsertPerm } from '@/permission/service.js';

type DefaultPermissionRule = { toolName: string; permission: ToolPermissionValue; pattern: string };

function allowDirectory(toolName: string, directory: string): DefaultPermissionRule {
  return { toolName, permission: 'allow', pattern: `${directory}${path.sep}*` };
}

function getDefaultPermissionRules(): DefaultPermissionRule[] {
  return [
    allowDirectory('read', PATHS.dirPaths.skills),
    allowDirectory('write', PATHS.dirPaths.skills),
    allowDirectory('read', PATHS.dirPaths.recordings),
    allowDirectory('write', PATHS.dirPaths.recordings),
    allowDirectory('grep', PATHS.dirPaths.recordings),
    allowDirectory('glob', PATHS.dirPaths.recordings),
  ];
}

export async function syncDefaultPermissions(): Promise<void> {
  const rules = getDefaultPermissionRules();
  await Promise.all(rules.map((rule) => upsertPerm(rule)));
}
