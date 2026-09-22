import { useSuspenseQuery } from '@tanstack/react-query';

import { shortcutsQueryOptions } from '@/lib/queries/shortcuts';

interface ShortcutInfo {
  hotkey: string | null;
  isSequence: boolean;
}

export function useShortcuts(): Map<string, ShortcutInfo> {
  const { data: shortcuts } = useSuspenseQuery(shortcutsQueryOptions);

  const resolved = new Map<string, ShortcutInfo>();
  for (const entry of shortcuts) {
    resolved.set(entry.actionId, { hotkey: entry.hotkey, isSequence: entry.isSequence });
  }
  return resolved;
}
