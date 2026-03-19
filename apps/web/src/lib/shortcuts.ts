import { useMemo } from 'react';

import type { Hotkey } from '@tanstack/react-hotkeys';
import { useSuspenseQuery } from '@tanstack/react-query';

import { shortcutsQueryOptions } from '@/lib/queries/shortcuts';

interface ShortcutInfo {
  hotkey: Hotkey | null;
  isSequence: boolean;
}

export function useShortcuts(): Map<string, ShortcutInfo> {
  const { data: shortcuts } = useSuspenseQuery(shortcutsQueryOptions);

  return useMemo(() => {
    const resolved = new Map<string, ShortcutInfo>();
    for (const entry of shortcuts) {
      resolved.set(entry.actionId, {
        hotkey: entry.hotkey as Hotkey | null,
        isSequence: entry.isSequence,
      });
    }
    return resolved;
  }, [shortcuts]);
}
