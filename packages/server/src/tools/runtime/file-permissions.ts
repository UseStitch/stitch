import path from 'node:path';

import type { PermissionSuggestion } from '@stitch/shared/permissions/types';

import type { ToolInput } from '@/tools/runtime/runtime.js';

function resolveAbsoluteFilePath(input: ToolInput): string | null {
  const filePath = input.filePath;
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  if (!path.isAbsolute(filePath)) return null;
  return path.resolve(filePath);
}

export function getFilePathPatternTargets(input: ToolInput): string[] {
  const targetPath = resolveAbsoluteFilePath(input);
  if (!targetPath) return [];
  return [targetPath];
}

export function getParentDirPermissionSuggestion(input: ToolInput): PermissionSuggestion | null {
  const targetPath = resolveAbsoluteFilePath(input);
  if (!targetPath) return null;

  const parentDir = path.dirname(targetPath);
  const pattern = path.join(parentDir, '*');

  return { message: `Always allow in ${parentDir}`, pattern };
}
