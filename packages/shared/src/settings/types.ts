import { z } from 'zod';

export const SETTINGS_KEYS = [
  'model.default.providerId',
  'model.default.modelId',
  'model.compaction.providerId',
  'model.compaction.modelId',
  'model.title.providerId',
  'model.title.modelId',
  'compaction.auto',
  'compaction.prune',
  'compaction.reserved',
  'toolsets.defaultScope',
  'toolsets.ttlTurns',
  'appearance.mode',
  'appearance.theme',
  'onboarding.status',
  'onboarding.version',
  'profile.name',
  'profile.timezone',
  'notifications.sound.enabled',
  'browser.profileImported',
  'browser.activeProfile',
  'shortcuts.leaderKey',
  'memory.enabled',
  'memory.autoExtract',
  'memory.embedding.providerId',
  'memory.embedding.modelId',
  'memory.extraction.maxFactsPerTurn',
  'memory.extraction.minMessageLength',
  'memory.extraction.confidenceFilter',
  'memory.extraction.importanceMinScore',
  'memory.extraction.maxFactsPerSession',
  'memory.extraction.minTurnsBetweenWrites',
  'memory.retention.maxMemories',
  'memory.retention.staleDays',
  'memory.retention.autoprune',
  'memory.retrieval.maxResults',
  'memory.retrieval.minScore',
  'memory.retrieval.recencyBoost',
  'recordings.autoAnalyze',
  'recordings.inputDeviceId',
  'recordings.outputDeviceId',
  'recordings.speakerGain',
  'recordings.transcription.providerId',
  'recordings.transcription.modelId',
  'recordings.analysis.providerId',
  'recordings.analysis.modelId',
  'recordings.analysis.defaultTemplateId',
  'stt.default.providerId',
  'stt.default.modelId',
  'stt.holdToTalk',
] as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

const booleanSetting = z.enum(['true', 'false']).transform((value) => value === 'true');

export const SETTINGS_SCHEMAS = {
  'model.default.providerId': z.string(),
  'model.default.modelId': z.string(),
  'model.compaction.providerId': z.string(),
  'model.compaction.modelId': z.string(),
  'model.title.providerId': z.string(),
  'model.title.modelId': z.string(),
  'compaction.auto': booleanSetting,
  'compaction.prune': booleanSetting,
  'compaction.reserved': z.coerce.number().int().min(0),
  'toolsets.defaultScope': z.enum(['current_run', 'ttl_turns', 'until_deactivated']),
  'toolsets.ttlTurns': z.coerce.number().int().min(1),
  'appearance.mode': z.enum(['light', 'dark', 'system']),
  'appearance.theme': z.enum(['default', 'dracula', 'solarized', 'tokyonight']),
  'onboarding.status': z.enum(['pending', 'completed']),
  'onboarding.version': z.string().regex(/^\d+$/),
  'profile.name': z.string().min(1).max(80),
  'profile.timezone': z.string().min(1).max(120),
  'notifications.sound.enabled': booleanSetting,
  'browser.profileImported': z.string(),
  'browser.activeProfile': z.string(),
  'shortcuts.leaderKey': z.string().regex(/^Mod\+[A-Za-z0-9]$/),
  'memory.enabled': booleanSetting,
  'memory.autoExtract': booleanSetting,
  'memory.embedding.providerId': z.string(),
  'memory.embedding.modelId': z.string(),
  'memory.extraction.maxFactsPerTurn': z.coerce.number().int().min(1),
  'memory.extraction.minMessageLength': z.coerce.number().int().min(0),
  'memory.extraction.confidenceFilter': z.enum(['stated', 'all', 'stated+confirmed']),
  'memory.extraction.importanceMinScore': z.coerce.number().min(0).max(1),
  'memory.extraction.maxFactsPerSession': z.coerce.number().int().min(1),
  'memory.extraction.minTurnsBetweenWrites': z.coerce.number().int().min(0),
  'memory.retention.maxMemories': z.coerce.number().int().min(10),
  'memory.retention.staleDays': z.coerce.number().int().min(1),
  'memory.retention.autoprune': booleanSetting,
  'memory.retrieval.maxResults': z.coerce.number().int().min(1),
  'memory.retrieval.minScore': z.coerce.number().min(0).max(1),
  'memory.retrieval.recencyBoost': booleanSetting,
  'recordings.autoAnalyze': booleanSetting,
  'recordings.inputDeviceId': z.string(),
  'recordings.outputDeviceId': z.string(),
  'recordings.speakerGain': z.coerce.number().min(0.1).max(50),
  'recordings.transcription.providerId': z.string(),
  'recordings.transcription.modelId': z.string(),
  'recordings.analysis.providerId': z.string(),
  'recordings.analysis.modelId': z.string(),
  'recordings.analysis.defaultTemplateId': z.string(),
  'stt.default.providerId': z.string(),
  'stt.default.modelId': z.string(),
  'stt.holdToTalk': booleanSetting,
} as const;

export function isValidLeaderKeyHotkey(value: string): boolean {
  return SETTINGS_SCHEMAS['shortcuts.leaderKey'].safeParse(value).success;
}

type SettingDefault = {
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
    key: 'toolsets.defaultScope',
    value: 'ttl_turns',
    description: 'Default activation lifetime when activate_toolset omits a scope.',
  },
  {
    key: 'toolsets.ttlTurns',
    value: '3',
    description: 'Turns of inactivity before a TTL-scoped toolset expires.',
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
    key: 'profile.timezone',
    value: '',
    description: 'Preferred IANA timezone used for time-aware prompts and tools.',
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
  {
    key: 'memory.enabled',
    value: 'false',
    description:
      'Enable persistent memory system that learns user preferences and facts across sessions.',
  },
  {
    key: 'memory.autoExtract',
    value: 'true',
    description: 'Automatically extract and store memories from conversations after each response.',
  },
  {
    key: 'memory.embedding.providerId',
    value: '',
    description: 'Provider ID for the embedding model used by the memory system.',
  },
  {
    key: 'memory.embedding.modelId',
    value: '',
    description: 'Embedding model ID from the selected provider used by the memory system.',
  },
  {
    key: 'memory.extraction.maxFactsPerTurn',
    value: '1',
    description: 'Max facts extracted and persisted per conversation turn.',
  },
  {
    key: 'memory.extraction.minMessageLength',
    value: '100',
    description: 'Skip extraction if user message is shorter than this (in characters).',
  },
  {
    key: 'memory.extraction.confidenceFilter',
    value: 'stated',
    description: 'Which confidences to auto-persist: stated, all, or stated+confirmed.',
  },
  {
    key: 'memory.extraction.importanceMinScore',
    value: '0.7',
    description:
      'Minimum importance score (0–1) a fact must have to be persisted. Lower scores are discarded.',
  },
  {
    key: 'memory.extraction.maxFactsPerSession',
    value: '20',
    description:
      'Hard cap on total auto-extracted facts written per session. Prevents burst over-capture.',
  },
  {
    key: 'memory.extraction.minTurnsBetweenWrites',
    value: '3',
    description:
      'Minimum user turns between consecutive auto-memory writes for the same session. Acts as a cooldown.',
  },
  {
    key: 'memory.retention.maxMemories',
    value: '150',
    description: 'Hard cap on total stored memories. Oldest low-value memories pruned first.',
  },
  {
    key: 'memory.retention.staleDays',
    value: '30',
    description: 'Memories not accessed in this many days are candidates for pruning.',
  },
  {
    key: 'memory.retention.autoprune',
    value: 'true',
    description: 'Run automatic pruning after extraction to stay within limits.',
  },
  {
    key: 'memory.retrieval.maxResults',
    value: '3',
    description: 'Max memories injected into context per turn.',
  },
  {
    key: 'memory.retrieval.minScore',
    value: '0.6',
    description: 'Minimum relevance score to include a memory in context.',
  },
  {
    key: 'memory.retrieval.recencyBoost',
    value: 'true',
    description: 'Boost recently-accessed memories in ranking.',
  },
  {
    key: 'recordings.autoAnalyze',
    value: 'false',
    description: 'Automatically run transcription and LLM analysis when a recording is completed.',
  },
  {
    key: 'recordings.inputDeviceId',
    value: '',
    description: 'Preferred microphone device name. Empty string uses the system default.',
  },
  {
    key: 'recordings.outputDeviceId',
    value: '',
    description:
      'Preferred speaker device name for system audio capture. Empty string uses the system default.',
  },
  {
    key: 'recordings.speakerGain',
    value: '10',
    description: 'Speaker volume gain multiplier for dual mode mixing. Range: 0.1 to 50.',
  },
  {
    key: 'recordings.transcription.providerId',
    value: '',
    description: 'Preferred provider ID used for recording transcription.',
  },
  {
    key: 'recordings.transcription.modelId',
    value: '',
    description: 'Preferred model ID used for recording transcription.',
  },
  {
    key: 'recordings.analysis.providerId',
    value: '',
    description: 'Preferred provider ID used for recording analysis and summaries.',
  },
  {
    key: 'recordings.analysis.modelId',
    value: '',
    description: 'Preferred model ID used for recording analysis and summaries.',
  },
  {
    key: 'recordings.analysis.defaultTemplateId',
    value: 'mnt_prebuilt_executive_summary',
    description: 'Default meeting note template used for recording analysis.',
  },
  {
    key: 'stt.default.providerId',
    value: '',
    description:
      'Provider ID for the default STT model used for live speech-to-text in the chat input.',
  },
  {
    key: 'stt.default.modelId',
    value: '',
    description:
      'Model ID for the default STT model used for live speech-to-text in the chat input.',
  },
  {
    key: 'stt.holdToTalk',
    value: 'false',
    description:
      'When enabled, the dictation shortcut records only while held and finalizes on release (push-to-talk). When disabled, the shortcut toggles recording on and off.',
  },
];
