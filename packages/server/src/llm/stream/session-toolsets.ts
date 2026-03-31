import type { PrefixedString } from '@stitch/shared/id';

const activeToolsetsBySession = new Map<PrefixedString<'ses'>, Set<string>>();

export function getSessionActiveToolsetIds(sessionId: PrefixedString<'ses'>): string[] {
  return [...(activeToolsetsBySession.get(sessionId) ?? new Set<string>())];
}

export function setSessionActiveToolsetIds(
  sessionId: PrefixedString<'ses'>,
  toolsetIds: Iterable<string>,
): void {
  const ids = new Set(toolsetIds);
  if (ids.size === 0) {
    activeToolsetsBySession.delete(sessionId);
    return;
  }
  activeToolsetsBySession.set(sessionId, ids);
}
