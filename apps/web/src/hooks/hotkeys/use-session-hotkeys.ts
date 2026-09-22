import { useHotkey, useHotkeySequence } from '@tanstack/react-hotkeys';

import { toValidHotkey, toValidHotkeySequence } from './hotkey-utils';

import type { Action } from '@/hooks/use-actions';
import { useShortcuts } from '@/hooks/use-shortcuts';

export function useSessionHotkeys(actions: Action[]) {
  const shortcuts = useShortcuts();
  const actionMap = new Map(actions.map((a) => [a.id, a]));

  const renameSession = shortcuts.get('rename-session');
  const stopStream = shortcuts.get('stop-stream');

  useHotkey(toValidHotkey(renameSession?.hotkey, 'Mod+Shift+R'), () => actionMap.get('rename-session')?.run(), {
    preventDefault: true,
    enabled: !!renameSession?.hotkey,
  });

  useHotkeySequence(
    toValidHotkeySequence([stopStream?.hotkey ?? 'Escape', stopStream?.hotkey ?? 'Escape'], ['Escape', 'Escape']),
    () => actionMap.get('stop-stream')?.run(),
    { enabled: !!stopStream?.hotkey, timeout: 500 },
  );
}
