export * from './providers.js';

export const SETTINGS_KEYS = ['model.default', 'model.compaction', 'model.title'] as const;
export type SettingsKey = (typeof SETTINGS_KEYS)[number];

export const SHORTCUT_ACTION_IDS = ['command-palette', 'open-settings', 'toggle-sidebar'] as const;
export type ShortcutActionId = (typeof SHORTCUT_ACTION_IDS)[number];
