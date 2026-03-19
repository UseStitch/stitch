export const SETTINGS_KEYS = [
  'model.default',
  'model.compaction',
  'model.title',
  'compaction.auto',
  'compaction.prune',
  'compaction.reserved',
  'agent.default',
  'appearance.mode',
  'appearance.theme',
  'onboarding.status',
] as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[number];
