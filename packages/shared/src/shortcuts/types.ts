export const SHORTCUT_ACTION_IDS = [
  'command-palette',
  'open-settings',
  'open-chat',
  'toggle-sidebar',
  'new-session',
  'switch-primary-agent',
  'rename-session',
  'compact-session',
  'stop-stream',
  'open-recordings',
] as const;

export type ShortcutActionId = (typeof SHORTCUT_ACTION_IDS)[number];

export const SHORTCUT_CATEGORIES = [
  'Workspace',
  'Chat & Agents',
  'Sessions',
  'Recordings',
] as const;

export type ShortcutCategory = (typeof SHORTCUT_CATEGORIES)[number];

export interface ShortcutDefault {
  actionId: ShortcutActionId;
  hotkey: string | null;
  isSequence: boolean;
  label: string;
  category: ShortcutCategory;
}

export const SHORTCUT_DEFAULTS: ShortcutDefault[] = [
  {
    actionId: 'command-palette',
    hotkey: 'Mod+P',
    isSequence: false,
    label: 'Command palette',
    category: 'Workspace',
  },
  {
    actionId: 'open-settings',
    hotkey: 'Mod+,',
    isSequence: false,
    label: 'Open settings',
    category: 'Workspace',
  },
  {
    actionId: 'open-chat',
    hotkey: 'LEADER+C',
    isSequence: true,
    label: 'Chat',
    category: 'Chat & Agents',
  },
  {
    actionId: 'toggle-sidebar',
    hotkey: 'Mod+B',
    isSequence: false,
    label: 'Toggle sidebar',
    category: 'Workspace',
  },
  {
    actionId: 'new-session',
    hotkey: 'Mod+N',
    isSequence: false,
    label: 'New session',
    category: 'Sessions',
  },
  {
    actionId: 'switch-primary-agent',
    hotkey: 'Mod+T',
    isSequence: false,
    label: 'Switch primary agent',
    category: 'Chat & Agents',
  },
  {
    actionId: 'rename-session',
    hotkey: 'Mod+Shift+R',
    isSequence: false,
    label: 'Rename session',
    category: 'Sessions',
  },
  {
    actionId: 'compact-session',
    hotkey: null,
    isSequence: false,
    label: 'Compact session',
    category: 'Sessions',
  },
  {
    actionId: 'stop-stream',
    hotkey: 'Escape',
    isSequence: true,
    label: 'Stop stream (double press)',
    category: 'Chat & Agents',
  },
  {
    actionId: 'open-recordings',
    hotkey: 'LEADER+R',
    isSequence: true,
    label: 'Recordings',
    category: 'Recordings',
  },
];
