import { useHotkey } from '@tanstack/react-hotkeys';
import { useShortcuts } from '@/lib/shortcuts';
import type { Action } from '@/lib/actions';

export function useGlobalHotkeys(actions: Action[]) {
  const shortcuts = useShortcuts();
  const actionMap = new Map(actions.map((a) => [a.id, a]));

  const commandPaletteKey = shortcuts.get('command-palette');
  const openSettingsKey = shortcuts.get('open-settings');
  const newSessionKey = shortcuts.get('new-session');

  useHotkey(commandPaletteKey ?? 'Mod+P', () => actionMap.get('command-palette')?.run(), {
    preventDefault: true,
    enabled: !!commandPaletteKey,
  });
  useHotkey(openSettingsKey ?? 'Mod+,', () => actionMap.get('open-settings')?.run(), {
    preventDefault: true,
    enabled: !!openSettingsKey,
  });
  useHotkey(newSessionKey ?? 'Mod+N', () => actionMap.get('new-session')?.run(), {
    preventDefault: true,
    enabled: !!newSessionKey,
  });
}
