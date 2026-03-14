import { useMemo } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { Hotkey } from '@tanstack/react-hotkeys';
import type { ShortcutActionId } from '@openwork/shared';
import { shortcutsQueryOptions } from '@/lib/queries/shortcuts';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  category: string;
  defaultHotkey: Hotkey | null;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'command-palette', label: 'Command palette', category: 'General', defaultHotkey: 'Mod+P' },
  { id: 'open-settings', label: 'Open settings', category: 'General', defaultHotkey: 'Mod+,' },
  { id: 'toggle-sidebar', label: 'Toggle sidebar', category: 'General', defaultHotkey: 'Mod+B' },
  { id: 'new-session', label: 'New session', category: 'General', defaultHotkey: 'Mod+N' },
  { id: 'rename-session', label: 'Rename session', category: 'General', defaultHotkey: 'Mod+Shift+R' },
];

export function useShortcuts(): Map<string, Hotkey | null> {
  const { data: overrides } = useSuspenseQuery(shortcutsQueryOptions);

  return useMemo(() => {
    const resolved = new Map<string, Hotkey | null>();
    for (const def of SHORTCUT_DEFINITIONS) {
      const override = def.id in overrides ? overrides[def.id]! : def.defaultHotkey;
      resolved.set(def.id, override as Hotkey | null);
    }
    return resolved;
  }, [overrides]);
}
