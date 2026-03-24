import type { Hotkey } from '@tanstack/react-hotkeys';
import { useHotkey, useHotkeySequence } from '@tanstack/react-hotkeys';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';

import { SETTINGS_DEFAULTS } from '@stitch/shared/settings/types';

import type { Action } from '@/lib/actions';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { useShortcuts } from '@/lib/shortcuts';

const LEADER_PREFIX = 'LEADER+';

const defaultLeaderKey = SETTINGS_DEFAULTS.find((s) => s.key === 'shortcuts.leaderKey')!.value;

function resolveLeaderHotkey(
  hotkey: string,
  leaderKey: string,
): { leader: Hotkey; suffix: Hotkey } | null {
  if (!hotkey.startsWith(LEADER_PREFIX)) return null;
  const suffix = hotkey.slice(LEADER_PREFIX.length);
  return { leader: leaderKey as Hotkey, suffix: suffix as Hotkey };
}

export function useGlobalHotkeys(actions: Action[]) {
  const shortcuts = useShortcuts();
  const actionMap = new Map(actions.map((a) => [a.id, a]));
  const params = useParams({ strict: false });
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  const isSessionPage = !!params.id;
  const leaderKey = settings['shortcuts.leaderKey'] || defaultLeaderKey;

  const commandPalette = shortcuts.get('command-palette');
  const openSettings = shortcuts.get('open-settings');
  const newSession = shortcuts.get('new-session');
  const switchPrimaryAgent = shortcuts.get('switch-primary-agent');
  const renameSession = shortcuts.get('rename-session');
  const stopStream = shortcuts.get('stop-stream');
  const openRecordings = shortcuts.get('open-recordings');

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
  useHotkey(
    switchPrimaryAgent?.hotkey ?? 'Mod+T',
    () => actionMap.get('switch-primary-agent')?.run(),
    {
      preventDefault: true,
      enabled: !!switchPrimaryAgent?.hotkey,
    },
  );
  useHotkey(renameSession?.hotkey ?? 'Mod+Shift+R', () => actionMap.get('rename-session')?.run(), {
    preventDefault: true,
    enabled: !!renameSession?.hotkey && isSessionPage,
  });
  useHotkeySequence(
    [stopStream?.hotkey ?? 'Escape', stopStream?.hotkey ?? 'Escape'],
    () => actionMap.get('stop-stream')?.run(),
    { enabled: !!stopStream?.hotkey && isSessionPage, timeout: 500 },
  );

  // Leader key sequences
  const recordingsResolved = openRecordings?.hotkey
    ? resolveLeaderHotkey(openRecordings.hotkey as string, leaderKey)
    : null;

  useHotkeySequence(
    recordingsResolved
      ? [recordingsResolved.leader, recordingsResolved.suffix]
      : ['Mod+X', 'R'],
    () => actionMap.get('open-recordings')?.run(),
    { enabled: !!recordingsResolved, timeout: 1000 },
  );
}
