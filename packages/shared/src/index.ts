export * from './messages.js';
export * from './providers.js';
export * from './realtime.js';

export const SETTINGS_KEYS = [
  'model.default',
  'model.compaction',
  'model.title',
  'appearance.mode',
  'appearance.theme',
] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];

export const APPEARANCE_MODES = ['light', 'dark', 'system'] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const SHORTCUT_ACTION_IDS = [
  'command-palette',
  'open-settings',
  'toggle-sidebar',
  'new-session',
] as const;
export type ShortcutActionId = (typeof SHORTCUT_ACTION_IDS)[number];
