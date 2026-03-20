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

export type SettingDefault = {
  key: SettingsKey;
  value: string;
  description: string;
};

export const SETTINGS_DEFAULTS: SettingDefault[] = [
  { key: 'model.default', value: '', description: 'Default model for chat and coding tasks.' },
  {
    key: 'model.compaction',
    value: '',
    description: 'Preferred model for conversation compaction summaries.',
  },
  { key: 'model.title', value: '', description: 'Preferred model for generating session titles.' },
  {
    key: 'compaction.auto',
    value: 'true',
    description:
      'Enable automatic context compaction when token usage reaches the configured threshold.',
  },
  {
    key: 'compaction.prune',
    value: 'true',
    description: 'Prune old tool outputs before generating a compaction summary.',
  },
  {
    key: 'compaction.reserved',
    value: '20000',
    description: 'Reserved token headroom used when deciding whether to compact.',
  },
  { key: 'agent.default', value: '', description: 'Default agent used for new sessions.' },
  {
    key: 'appearance.mode',
    value: 'system',
    description: 'Preferred appearance mode: light, dark, or system.',
  },
  { key: 'appearance.theme', value: 'default', description: 'Selected application theme name.' },
  {
    key: 'onboarding.status',
    value: 'pending',
    description: 'Tracks whether onboarding is pending or completed.',
  },
];
