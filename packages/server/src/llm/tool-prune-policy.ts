import type { StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { browserPrunePolicy } from '@/tools/toolsets/browser/prune-policy.js';

export type PrunePolicyMessage = {
  id: PrefixedString<'msg'>;
  parts: StoredPart[];
};

export type PruneProtectOverride = {
  protectTokens: number;
  reason: string;
};

export type ToolPrunePolicy = {
  name: string;
  findProtectOverrides: (messages: PrunePolicyMessage[]) => Map<string, PruneProtectOverride>;
};

const TOOL_PRUNE_POLICIES: ToolPrunePolicy[] = [browserPrunePolicy];

export function getToolPruneProtectOverrides(
  messages: PrunePolicyMessage[],
): Map<string, PruneProtectOverride> {
  const overrides = new Map<string, PruneProtectOverride>();

  for (const policy of TOOL_PRUNE_POLICIES) {
    for (const [key, override] of policy.findProtectOverrides(messages)) {
      const existing = overrides.get(key);
      if (!existing || override.protectTokens < existing.protectTokens) {
        overrides.set(key, override);
      }
    }
  }

  return overrides;
}
