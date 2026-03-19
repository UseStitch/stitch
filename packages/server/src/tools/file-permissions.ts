import path from 'node:path';

import type { PermissionSuggestion } from '@stitch/shared/permissions/types';

function resolveAbsoluteFilePath(input: unknown): string | null {
  const filePath = (input as { filePath?: unknown })?.filePath;
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  if (!path.isAbsolute(filePath)) return null;
  return path.resolve(filePath);
}

export function getFilePathPatternTargets(input: unknown): string[] {
  const targetPath = resolveAbsoluteFilePath(input);
  if (!targetPath) return [];
  return [targetPath];
}

export function getParentDirPermissionSuggestion(input: unknown): PermissionSuggestion | null {
  const targetPath = resolveAbsoluteFilePath(input);
  if (!targetPath) return null;

  const parentDir = path.dirname(targetPath);
  const pattern = path.join(parentDir, '*');

  return {
    message: 'Always allow in parent dir',
    pattern,
  };
}
