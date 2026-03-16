import { useHotkey, useHotkeySequence } from '@tanstack/react-hotkeys';
import { useParams } from '@tanstack/react-router';

import type { Action } from '@/lib/actions';
import { useShortcuts } from '@/lib/shortcuts';

export function useGlobalHotkeys(actions: Action[]) {
  const shortcuts = useShortcuts();
  const actionMap = new Map(actions.map((a) => [a.id, a]));
  const params = useParams({ strict: false });

  const isSessionPage = !!params.id;

  const commandPaletteKey = shortcuts.get('command-palette');
  const openSettingsKey = shortcuts.get('open-settings');
  const newSessionKey = shortcuts.get('new-session');
  const renameSessionKey = shortcuts.get('rename-session');
  const stopStreamKey = shortcuts.get('stop-stream');

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
  useHotkey(renameSessionKey ?? 'Mod+Shift+R', () => actionMap.get('rename-session')?.run(), {
    preventDefault: true,
    enabled: !!renameSessionKey && isSessionPage,
  });
  useHotkeySequence(
    [stopStreamKey ?? 'Escape', stopStreamKey ?? 'Escape'],
    () => actionMap.get('stop-stream')?.run(),
    { enabled: !!stopStreamKey && isSessionPage, timeout: 500 },
  );
}
