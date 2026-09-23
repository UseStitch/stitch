import path from 'node:path';
import { z } from 'zod';

import type { JsonObject } from '@stitch/shared/json';
import type { PermissionSuggestion } from '@stitch/shared/permissions/types';

const nonEmptyStringSchema = z.string().min(1);

function resolveAbsoluteFilePath(input: JsonObject): string | null {
  const filePath = input.filePath;
  const parsedFilePath = nonEmptyStringSchema.safeParse(filePath);
  if (!parsedFilePath.success || !path.isAbsolute(parsedFilePath.data)) return null;
  return path.resolve(parsedFilePath.data);
}

export function getFilePathPatternTargets(input: JsonObject): string[] {
  const targetPath = resolveAbsoluteFilePath(input);
  if (!targetPath) return [];
  return [targetPath];
}

export function getPathPatternTargets(input: JsonObject): string[] {
  const target = input.path;
  const parsedTarget = nonEmptyStringSchema.safeParse(target);
  return parsedTarget.success ? [parsedTarget.data] : [];
}

export function getParentDirPermissionSuggestion(input: JsonObject): PermissionSuggestion | null {
  const targetPath = resolveAbsoluteFilePath(input);
  if (!targetPath) return null;

  const parentDir = path.dirname(targetPath);
  const pattern = path.join(parentDir, '*');

  return { message: `Always allow in ${parentDir}`, pattern };
}
