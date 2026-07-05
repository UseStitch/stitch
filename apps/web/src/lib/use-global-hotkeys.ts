import type { Hotkey } from '@tanstack/react-hotkeys';
import { useHotkey, useHotkeySequence } from '@tanstack/react-hotkeys';
import { useSuspenseQuery } from '@tanstack/react-query';

import { SETTINGS_DEFAULTS } from '@stitch/shared/settings/types';
import { SHORTCUT_DEFAULTS } from '@stitch/shared/shortcuts/types';
import type { ShortcutActionId } from '@stitch/shared/shortcuts/types';

import type { Action } from '@/lib/actions';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { useShortcuts } from '@/lib/shortcuts';

const LEADER_PREFIX = 'LEADER+';

const defaultLeaderKey = SETTINGS_DEFAULTS.find((s) => s.key === 'shortcuts.leaderKey')!.value;
const defaultShortcutHotkeys = new Map(SHORTCUT_DEFAULTS.map((shortcut) => [shortcut.actionId, shortcut.hotkey]));

function getDefaultShortcutHotkey(actionId: ShortcutActionId): string | null {
  return defaultShortcutHotkeys.get(actionId) ?? null;
}

function resolveLeaderHotkey(hotkey: string, leaderKey: string): { leader: Hotkey; suffix: Hotkey } | null {
  if (!hotkey.startsWith(LEADER_PREFIX)) return null;
  const suffix = hotkey.slice(LEADER_PREFIX.length);
  return { leader: leaderKey as Hotkey, suffix: suffix as Hotkey };
}

export function useGlobalHotkeys(actions: Action[]) {
  const shortcuts = useShortcuts();
  const actionMap = new Map(actions.map((a) => [a.id, a]));
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);

  const leaderKey = settings['shortcuts.leaderKey'] || defaultLeaderKey;

  const commandPalette = shortcuts.get('command-palette');
  const openSettings = shortcuts.get('open-settings');
  const newSession = shortcuts.get('new-session');
  const openChat = shortcuts.get('open-chat');
  const openMemories = shortcuts.get('open-memories');
  const openRecordings = shortcuts.get('open-recordings');
  const openAutomations = shortcuts.get('open-automations');
  const openUsage = shortcuts.get('open-usage');

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

  // Leader key sequences
  const defaultChatHotkey = getDefaultShortcutHotkey('open-chat');
  const defaultMemoriesHotkey = getDefaultShortcutHotkey('open-memories');
  const defaultRecordingsHotkey = getDefaultShortcutHotkey('open-recordings');
  const defaultAutomationsHotkey = getDefaultShortcutHotkey('open-automations');
  const defaultUsageHotkey = getDefaultShortcutHotkey('open-usage');

  const chatResolved =
    resolveLeaderHotkey(openChat?.hotkey ?? defaultChatHotkey ?? '', leaderKey) ??
    (defaultChatHotkey ? resolveLeaderHotkey(defaultChatHotkey, leaderKey) : null);
  const memoriesResolved =
    resolveLeaderHotkey(openMemories?.hotkey ?? defaultMemoriesHotkey ?? '', leaderKey) ??
    (defaultMemoriesHotkey ? resolveLeaderHotkey(defaultMemoriesHotkey, leaderKey) : null);
  const recordingsResolved =
    resolveLeaderHotkey(openRecordings?.hotkey ?? defaultRecordingsHotkey ?? '', leaderKey) ??
    (defaultRecordingsHotkey ? resolveLeaderHotkey(defaultRecordingsHotkey, leaderKey) : null);
  const automationsResolved =
    resolveLeaderHotkey(openAutomations?.hotkey ?? defaultAutomationsHotkey ?? '', leaderKey) ??
    (defaultAutomationsHotkey ? resolveLeaderHotkey(defaultAutomationsHotkey, leaderKey) : null);
  const usageResolved =
    resolveLeaderHotkey(openUsage?.hotkey ?? defaultUsageHotkey ?? '', leaderKey) ??
    (defaultUsageHotkey ? resolveLeaderHotkey(defaultUsageHotkey, leaderKey) : null);

  useHotkeySequence(
    chatResolved ? [chatResolved.leader, chatResolved.suffix] : ['Mod+X', 'C'],
    () => actionMap.get('open-chat')?.run(),
    { enabled: !!chatResolved, timeout: 1000 },
  );
  useHotkeySequence(
    memoriesResolved ? [memoriesResolved.leader, memoriesResolved.suffix] : ['Mod+X', 'M'],
    () => actionMap.get('open-memories')?.run(),
    { enabled: !!memoriesResolved, timeout: 1000 },
  );
  useHotkeySequence(
    recordingsResolved ? [recordingsResolved.leader, recordingsResolved.suffix] : ['Mod+X', 'R'],
    () => actionMap.get('open-recordings')?.run(),
    { enabled: !!recordingsResolved, timeout: 1000 },
  );
  useHotkeySequence(
    automationsResolved ? [automationsResolved.leader, automationsResolved.suffix] : ['Mod+X', 'A'],
    () => actionMap.get('open-automations')?.run(),
    { enabled: !!automationsResolved, timeout: 1000 },
  );
  useHotkeySequence(
    usageResolved ? [usageResolved.leader, usageResolved.suffix] : ['Mod+X', 'U'],
    () => actionMap.get('open-usage')?.run(),
    { enabled: !!usageResolved, timeout: 1000 },
  );
}
