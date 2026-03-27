export const SETTINGS_KEYS = [
  'model.default.providerId',
  'model.default.modelId',
  'model.compaction.providerId',
  'model.compaction.modelId',
  'model.title.providerId',
  'model.title.modelId',
  'recordings.default.providerId',
  'recordings.default.modelId',
  'recordings.autoTranscribe',
  'compaction.auto',
  'compaction.prune',
  'compaction.reserved',
  'agent.default',
  'appearance.mode',
  'appearance.theme',
  'onboarding.status',
  'notifications.sound.enabled',
  'shortcuts.leaderKey',
] as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

export type SettingDefault = {
  key: SettingsKey;
  value: string;
  description: string;
};

const LEADER_KEY_HOTKEY_PATTERN = /^Mod\+[A-Za-z0-9]$/;

export function isValidLeaderKeyHotkey(value: string): boolean {
  return LEADER_KEY_HOTKEY_PATTERN.test(value);
}

export const SETTINGS_DEFAULTS: SettingDefault[] = [
  {
    key: 'model.default.providerId',
    value: '',
    description: 'Provider ID for the default model used for chat and coding tasks.',
  },
  {
    key: 'model.default.modelId',
    value: '',
    description: 'Model ID for the default model used for chat and coding tasks.',
  },
  {
    key: 'model.compaction.providerId',
    value: '',
    description: 'Provider ID for the preferred model for conversation compaction summaries.',
  },
  {
    key: 'model.compaction.modelId',
    value: '',
    description: 'Model ID for the preferred model for conversation compaction summaries.',
  },
  {
    key: 'model.title.providerId',
    value: '',
    description: 'Provider ID for the preferred model for generating session titles.',
  },
  {
    key: 'model.title.modelId',
    value: '',
    description: 'Model ID for the preferred model for generating session titles.',
  },
  {
    key: 'recordings.default.providerId',
    value: '',
    description: 'Provider ID for the default model used for recording transcriptions.',
  },
  {
    key: 'recordings.default.modelId',
    value: '',
    description: 'Model ID for the default model used for recording transcriptions.',
  },
  {
    key: 'recordings.autoTranscribe',
    value: 'false',
    description: 'Automatically start transcription when a recording finishes.',
  },
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
  {
    key: 'notifications.sound.enabled',
    value: 'true',
    description: 'Play an attention sound when the AI needs your input (question or permission).',
  },
  {
    key: 'shortcuts.leaderKey',
    value: 'Mod+X',
    description:
      'Leader key prefix for key sequences. Shortcuts using LEADER+ are prefixed with this key.',
  },
];
