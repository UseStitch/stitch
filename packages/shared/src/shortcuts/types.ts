export const SHORTCUT_ACTION_IDS = [
  'command-palette',
  'open-settings',
  'toggle-sidebar',
  'new-session',
  'switch-primary-agent',
  'rename-session',
  'compact-session',
  'stop-stream',
] as const;

export type ShortcutActionId = (typeof SHORTCUT_ACTION_IDS)[number];

export interface ShortcutDefault {
  actionId: ShortcutActionId;
  hotkey: string | null;
  isSequence: boolean;
  label: string;
  category: string;
}

export const SHORTCUT_DEFAULTS: ShortcutDefault[] = [
  {
    actionId: 'command-palette',
    hotkey: 'Mod+P',
    isSequence: false,
    label: 'Command palette',
    category: 'General',
  },
  {
    actionId: 'open-settings',
    hotkey: 'Mod+,',
    isSequence: false,
    label: 'Open settings',
    category: 'General',
  },
  {
    actionId: 'toggle-sidebar',
    hotkey: 'Mod+B',
    isSequence: false,
    label: 'Toggle sidebar',
    category: 'General',
  },
  {
    actionId: 'new-session',
    hotkey: 'Mod+N',
    isSequence: false,
    label: 'New session',
    category: 'General',
  },
  {
    actionId: 'switch-primary-agent',
    hotkey: 'Mod+T',
    isSequence: false,
    label: 'Switch primary agent',
    category: 'General',
  },
  {
    actionId: 'rename-session',
    hotkey: 'Mod+Shift+R',
    isSequence: false,
    label: 'Rename session',
    category: 'General',
  },
  {
    actionId: 'compact-session',
    hotkey: null,
    isSequence: false,
    label: 'Compact session',
    category: 'General',
  },
  {
    actionId: 'stop-stream',
    hotkey: 'Escape',
    isSequence: true,
    label: 'Stop stream (double press)',
    category: 'Chat',
  },
];
