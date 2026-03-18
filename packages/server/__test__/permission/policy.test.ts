import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { resolvePermissionFromRules, wildcardPatternMatches } from '@/permission/policy.js';

describe('permission policy', () => {
  test('falls back to ask when no rule matches', () => {
    const result = resolvePermissionFromRules([], []);
    expect(result).toBe('ask');
  });

  test('prefers global tool rule when present', () => {
    const result = resolvePermissionFromRules(
      [
        { pattern: null, permission: 'deny' },
        { pattern: 'seattle*', permission: 'allow' },
      ],
      ['seattle-wa'],
    );

    expect(result).toBe('deny');
  });

  test('uses most specific wildcard rule match', () => {
    const result = resolvePermissionFromRules(
      [
        { pattern: 'aws:*', permission: 'deny' },
        { pattern: 'aws:s3:*', permission: 'allow' },
      ],
      ['aws:s3:my-bucket'],
    );

    expect(result).toBe('allow');
  });

  test('matches wildcard pattern against targets', () => {
    expect(wildcardPatternMatches('project-*', ['project-alpha'])).toBe(true);
    expect(wildcardPatternMatches('project-*', ['workspace-alpha'])).toBe(false);
  });

  test('matches runtime-built parent-dir wildcard against file path targets', () => {
    const parentDir = path.join(process.cwd(), 'packages', 'server', 'src', 'tools');
    const pattern = path.join(parentDir, '*');

    expect(wildcardPatternMatches(pattern, [path.join(parentDir, 'read.ts')])).toBe(true);
    expect(wildcardPatternMatches(pattern, [path.join(parentDir, 'nested', 'read.ts')])).toBe(true);
    expect(wildcardPatternMatches(pattern, [path.join(process.cwd(), 'README.md')])).toBe(false);
  });

  test('resolves permission from wildcard file path rule', () => {
    const parentDir = path.join(process.cwd(), 'packages', 'server', 'src', 'tools');
    const pattern = path.join(parentDir, '*');
    const target = path.join(parentDir, 'file-permissions.ts');

    const result = resolvePermissionFromRules([{ pattern, permission: 'allow' }], [target]);

    expect(result).toBe('allow');
  });
});
