import { z } from 'zod';

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
  'appearance.mode',
  'appearance.theme',
  'onboarding.status',
  'onboarding.version',
  'profile.name',
  'notifications.sound.enabled',
  'browser.profileImported',
  'browser.activeProfile',
  'shortcuts.leaderKey',
] as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

export const SETTINGS_SCHEMAS: Record<SettingsKey, z.ZodType> = {
  'model.default.providerId': z.string(),
  'model.default.modelId': z.string(),
  'model.compaction.providerId': z.string(),
  'model.compaction.modelId': z.string(),
  'model.title.providerId': z.string(),
  'model.title.modelId': z.string(),
  'recordings.default.providerId': z.string(),
  'recordings.default.modelId': z.string(),
  'recordings.autoTranscribe': z.coerce.boolean(),
  'compaction.auto': z.coerce.boolean(),
  'compaction.prune': z.coerce.boolean(),
  'compaction.reserved': z.coerce.number().int().min(0),
  'appearance.mode': z.enum(['light', 'dark', 'system']),
  'appearance.theme': z.enum(['default', 'dracula', 'solarized', 'tokyonight']),
  'onboarding.status': z.enum(['pending', 'completed']),
  'onboarding.version': z.string().regex(/^\d+$/),
  'profile.name': z.string().min(1).max(80),
  'notifications.sound.enabled': z.coerce.boolean(),
  'browser.profileImported': z.string(),
  'browser.activeProfile': z.string(),
  'shortcuts.leaderKey': z.string().regex(/^Mod\+[A-Za-z0-9]$/),
} as const;

export function isValidLeaderKeyHotkey(value: string): boolean {
  return SETTINGS_SCHEMAS['shortcuts.leaderKey'].safeParse(value).success;
}

export type SettingDefault = {
  key: SettingsKey;
  value: string;
  description: string;
};

export const SETTINGS_DEFAULTS: SettingDefault[] = [
  {
    key: 'model.default.providerId',
    value: '',
    description:
      'Provider ID for the default model used for general conversations and assistance tasks.',
  },
  {
    key: 'model.default.modelId',
    value: '',
    description:
      'Model ID for the default model used for general conversations and assistance tasks.',
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
    key: 'onboarding.version',
    value: '1',
    description: 'Tracks which onboarding step version has been completed.',
  },
  {
    key: 'profile.name',
    value: '',
    description: 'Preferred user display name used in prompts and transcripts.',
  },
  {
    key: 'notifications.sound.enabled',
    value: 'true',
    description: 'Play an attention sound when the AI needs your input (question or permission).',
  },
  {
    key: 'browser.profileImported',
    value: '',
    description:
      'Tracks the last Chrome profile import (name and timestamp), or "skipped" if the user declined.',
  },
  {
    key: 'browser.activeProfile',
    value: '',
    description:
      'Active browser profile path in "<browser>/<profileId>" format (e.g. "chrome/Default").',
  },
  {
    key: 'shortcuts.leaderKey',
    value: 'Mod+X',
    description:
      'Leader key prefix for key sequences. Shortcuts using LEADER+ are prefixed with this key.',
  },
];
