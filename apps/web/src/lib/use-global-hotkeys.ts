import { useHotkey, useHotkeySequence } from '@tanstack/react-hotkeys';
import { useParams } from '@tanstack/react-router';

import type { Action } from '@/lib/actions';
import { useShortcuts } from '@/lib/shortcuts';

export function useGlobalHotkeys(actions: Action[]) {
  const shortcuts = useShortcuts();
  const actionMap = new Map(actions.map((a) => [a.id, a]));
  const params = useParams({ strict: false });

  const isSessionPage = !!params.id;

  const commandPalette = shortcuts.get('command-palette');
  const openSettings = shortcuts.get('open-settings');
  const newSession = shortcuts.get('new-session');
  const switchPrimaryAgent = shortcuts.get('switch-primary-agent');
  const renameSession = shortcuts.get('rename-session');
  const stopStream = shortcuts.get('stop-stream');

  useHotkey(commandPalette?.hotkey ?? 'Mod+P', () => actionMap.get('command-palette')?.run(), {
    preventDefault: true,
    enabled: !!commandPalette?.hotkey,
  });
  useHotkey(openSettings?.hotkey ?? 'Mod+,', () => actionMap.get('open-settings')?.run(), {
    preventDefault: true,
    enabled: !!openSettings?.hotkey,
  });
  useHotkey(newSession?.hotkey ?? 'Mod+N', () => actionMap.get('new-session')?.run(), {
    preventDefault: true,
    enabled: !!newSession?.hotkey,
  });
  useHotkey(switchPrimaryAgent?.hotkey ?? 'Mod+T', () => actionMap.get('switch-primary-agent')?.run(), {
    preventDefault: true,
    enabled: !!switchPrimaryAgent?.hotkey,
  });
  useHotkey(renameSession?.hotkey ?? 'Mod+Shift+R', () => actionMap.get('rename-session')?.run(), {
    preventDefault: true,
    enabled: !!renameSession?.hotkey && isSessionPage,
  });
  useHotkeySequence(
    [stopStream?.hotkey ?? 'Escape', stopStream?.hotkey ?? 'Escape'],
    () => actionMap.get('stop-stream')?.run(),
    { enabled: !!stopStream?.hotkey && isSessionPage, timeout: 500 },
  );
}
