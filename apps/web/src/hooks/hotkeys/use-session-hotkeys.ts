import { useHotkey, useHotkeySequence } from '@tanstack/react-hotkeys';

import type { Action } from '@/lib/actions';
import { useShortcuts } from '@/lib/shortcuts';

export function useSessionHotkeys(actions: Action[]) {
  const shortcuts = useShortcuts();
  const actionMap = new Map(actions.map((a) => [a.id, a]));

  const renameSession = shortcuts.get('rename-session');
  const stopStream = shortcuts.get('stop-stream');

  useHotkey(renameSession?.hotkey ?? 'Mod+Shift+R', () => actionMap.get('rename-session')?.run(), {
    preventDefault: true,
    enabled: !!renameSession?.hotkey,
  });

  useHotkeySequence(
    [stopStream?.hotkey ?? 'Escape', stopStream?.hotkey ?? 'Escape'],
    () => actionMap.get('stop-stream')?.run(),
    { enabled: !!stopStream?.hotkey, timeout: 500 },
  );
}
