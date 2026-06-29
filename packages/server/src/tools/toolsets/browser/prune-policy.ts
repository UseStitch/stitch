import type { ToolPrunePolicy } from '@/llm/tool-prune-policy.js';

const BROWSER_PRUNE_PROTECT = 10_000;

export const browserPrunePolicy: ToolPrunePolicy = {
  name: 'browser',
  findProtectOverrides(messages) {
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
  },
};
