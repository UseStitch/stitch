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
