import path from 'node:path';
import { describe, expect, test } from 'vitest';

import {
  getFilePathPatternTargets,
  getParentDirPermissionSuggestion,
} from '@/tools/file-permissions.js';

describe('file permission helpers', () => {
  test('derives pattern targets from absolute filePath', () => {
    const absolutePath = path.join(process.cwd(), 'packages', 'server', 'README.md');

    const targets = getFilePathPatternTargets({ filePath: absolutePath });

    expect(targets).toEqual([path.resolve(absolutePath)]);
  });

  test('returns no pattern targets for non-absolute filePath', () => {
    const targets = getFilePathPatternTargets({ filePath: 'packages/server/README.md' });

    expect(targets).toEqual([]);
  });

  test('creates parent directory wildcard suggestion from absolute filePath', () => {
    const absolutePath = path.join(process.cwd(), 'packages', 'server', 'src', 'tools', 'read.ts');

    const suggestion = getParentDirPermissionSuggestion({ filePath: absolutePath });

    expect(suggestion).toEqual({
      message: 'Always allow in parent dir',
      pattern: path.join(path.dirname(path.resolve(absolutePath)), '*'),
    });
  });

  test('returns no suggestion when filePath is invalid', () => {
    expect(getParentDirPermissionSuggestion({})).toBeNull();
    expect(getParentDirPermissionSuggestion({ filePath: '' })).toBeNull();
    expect(getParentDirPermissionSuggestion({ filePath: 'relative/path.txt' })).toBeNull();
  });
});
