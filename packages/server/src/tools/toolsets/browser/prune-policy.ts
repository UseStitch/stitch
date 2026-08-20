import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

const BROWSER_PRUNE_PROTECT = 10_000;

export type PrunePolicyMessage = { id: PrefixedString<'msg'>; parts: StoredPart[] };

export function findBrowserProtectOverrides(
  messages: PrunePolicyMessage[],
): Map<string, { protectTokens: number; reason: string }> {
  const overrides = new Map<string, { protectTokens: number; reason: string }>();

  for (const msg of messages) {
    const activeSnapshotIndices: number[] = [];
    for (let partIndex = 0; partIndex < msg.parts.length; partIndex++) {
      const part = msg.parts[partIndex];
      if (part.type !== 'tool-result') {
        continue;
      }

      if (part.toolName === 'browser_snapshot') {
        for (const index of activeSnapshotIndices) {
          overrides.set(`${msg.id}:${index}`, {
            protectTokens: BROWSER_PRUNE_PROTECT,
            reason: 'stale-browser-snapshot',
          });
        }
        activeSnapshotIndices.push(partIndex);
        continue;
      }

      if (part.toolName === 'browser_navigate') {
        for (const index of activeSnapshotIndices) {
          overrides.set(`${msg.id}:${index}`, {
            protectTokens: BROWSER_PRUNE_PROTECT,
            reason: 'stale-browser-snapshot-after-navigation',
          });
        }
        activeSnapshotIndices.length = 0;
      }
    }
  }

  return overrides;
}
