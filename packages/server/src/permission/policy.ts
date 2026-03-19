import type { AgentPermissionValue } from '@stitch/shared/permissions/types';

type PermissionRule = {
  pattern: string | null;
  permission: AgentPermissionValue;
};

type PatternRule = {
  pattern: string;
  permission: AgentPermissionValue;
};

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`);
}

export function wildcardPatternMatches(pattern: string, targets: string[]): boolean {
  const regex = wildcardToRegex(pattern);
  return targets.some((target) => regex.test(target));
}

export function resolvePermissionFromRules(
  rules: PermissionRule[],
  patternTargets: string[] = [],
): AgentPermissionValue {
  const globalRule = rules.find((row) => row.pattern === null);
  if (globalRule) return globalRule.permission;

  if (patternTargets.length === 0) return 'ask';

  const patternRules: PatternRule[] = rules.flatMap((row) =>
    row.pattern === null ? [] : [{ pattern: row.pattern, permission: row.permission }],
  );

  const patternMatchesBySpecificity = patternRules
    .filter((row) => wildcardPatternMatches(row.pattern, patternTargets))
    .sort((a, b) => b.pattern.length - a.pattern.length);

  const firstMatch = patternMatchesBySpecificity[0];
  if (!firstMatch) return 'ask';
  return firstMatch.permission;
}
