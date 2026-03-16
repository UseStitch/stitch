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
});
