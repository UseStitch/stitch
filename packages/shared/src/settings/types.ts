import { z } from 'zod';

import { APPEARANCE_MODES, APPEARANCE_THEMES } from '../appearance/types.js';

const booleanSetting = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * Single source of truth for all settings.
 * Each key maps to its Zod schema, default value, and description.
 */
const SETTINGS_REGISTRY = {
  'model.default.providerId': {
    schema: z.string(),
    default: '',
    description: 'Provider ID for the default model used for general conversations and assistance tasks.',
  },
  'model.default.modelId': {
    schema: z.string(),
    default: '',
    description: 'Model ID for the default model used for general conversations and assistance tasks.',
  },
  'model.compaction.providerId': {
    schema: z.string(),
    default: '',
    description: 'Provider ID for the preferred model for conversation compaction summaries.',
  },
  'model.compaction.modelId': {
    schema: z.string(),
    default: '',
    description: 'Model ID for the preferred model for conversation compaction summaries.',
  },
  'model.title.providerId': {
    schema: z.string(),
    default: '',
    description: 'Provider ID for the preferred model for generating session titles.',
  },
  'model.title.modelId': {
    schema: z.string(),
    default: '',
    description: 'Model ID for the preferred model for generating session titles.',
  },
  'compaction.auto': {
    schema: booleanSetting,
    default: 'true',
    description: 'Enable automatic context compaction when token usage reaches the configured threshold.',
  },
  'compaction.prune': {
    schema: booleanSetting,
    default: 'true',
    description: 'Prune old tool outputs before generating a compaction summary.',
  },
  'compaction.reserved': {
    schema: z.coerce.number().int().min(0),
    default: '20000',
    description: 'Reserved token headroom used when deciding whether to compact.',
  },
  'toolsets.defaultScope': {
    schema: z.enum(['current_run', 'ttl_turns', 'until_deactivated']),
    default: 'ttl_turns',
    description: 'Default activation lifetime when activate_toolset omits a scope.',
  },
  'toolsets.ttlTurns': {
    schema: z.coerce.number().int().min(1),
    default: '3',
    description: 'Turns of inactivity before a TTL-scoped toolset expires.',
  },
  'appearance.mode': {
    schema: z.enum(APPEARANCE_MODES),
    default: 'system',
    description: 'Preferred appearance mode: light, dark, or system.',
  },
  'appearance.theme': {
    schema: z.enum(APPEARANCE_THEMES),
    default: 'default',
    description: 'Selected application theme name.',
  },
  'onboarding.status': {
    schema: z.enum(['pending', 'completed']),
    default: 'pending',
    description: 'Tracks whether onboarding is pending or completed.',
  },
  'onboarding.version': {
    schema: z.string().regex(/^\d+$/),
    default: '1',
    description: 'Tracks which onboarding step version has been completed.',
  },
  'profile.name': {
    schema: z.string().max(80),
    default: '',
    description: 'Preferred user display name used in prompts and transcripts.',
  },
  'profile.timezone': {
    schema: z.string().max(120),
    default: '',
    description: 'Preferred IANA timezone used for time-aware prompts and tools.',
  },
  'notifications.sound.enabled': {
    schema: booleanSetting,
    default: 'true',
    description: 'Play an attention sound when the AI needs your input (question or permission).',
  },
  'browser.profileImported': {
    schema: z.string(),
    default: '',
    description: 'Tracks the last Chrome profile import (name and timestamp), or "skipped" if the user declined.',
  },
  'browser.activeProfile': {
    schema: z.string(),
    default: '',
    description: 'Active browser profile path in "<browser>/<profileId>" format (e.g. "chrome/Default").',
  },
  'shortcuts.leaderKey': {
    schema: z.string().regex(/^Mod\+[A-Za-z0-9]$/),
    default: 'Mod+X',
    description: 'Leader key prefix for key sequences. Shortcuts using LEADER+ are prefixed with this key.',
  },
  'memory.enabled': {
    schema: booleanSetting,
    default: 'false',
    description: 'Enable persistent memory system that learns user preferences and facts across sessions.',
  },
  'memory.autoExtract': {
    schema: booleanSetting,
    default: 'true',
    description: 'Automatically extract and store memories from conversations after each response.',
  },
  'memory.extraction.maxFactsPerTurn': {
    schema: z.coerce.number().int().min(1),
    default: '1',
    description: 'Max facts extracted and persisted per conversation turn.',
  },
  'memory.extraction.minMessageLength': {
    schema: z.coerce.number().int().min(0),
    default: '100',
    description: 'Skip extraction if user message is shorter than this (in characters).',
  },
  'memory.extraction.maxFactsPerSession': {
    schema: z.coerce.number().int().min(1),
    default: '20',
    description: 'Hard cap on total auto-extracted facts written per session. Prevents burst over-capture.',
  },
  'memory.extraction.minTurnsBetweenWrites': {
    schema: z.coerce.number().int().min(0),
    default: '3',
    description: 'Minimum user turns between consecutive auto-memory writes for the same session. Acts as a cooldown.',
  },
  'memory.extraction.fromAutomations': {
    schema: booleanSetting,
    default: 'false',
    description:
      'Allow automation sessions to extract and store new memories. When off, only chat sessions write memories.',
  },
  'memory.curated.memoryCharLimit': {
    schema: z.coerce.number().int().min(1_000).max(50_000),
    default: '8000',
    description: 'Maximum model-visible characters in long-term memory.',
  },
  'memory.curated.userCharLimit': {
    schema: z.coerce.number().int().min(500).max(25_000),
    default: '4000',
    description: 'Maximum model-visible characters in the user profile.',
  },
  'memory.consolidation.enabled': {
    schema: booleanSetting,
    default: 'true',
    description: 'Periodically curate eligible daily candidates into durable memory.',
  },
  'memory.consolidation.maxCandidatesPerRun': {
    schema: z.coerce.number().int().min(1).max(200),
    default: '50',
    description: 'Maximum daily candidates reviewed in one consolidation run.',
  },
  'agents.customInstructions': {
    schema: z.string().max(20_000),
    default: '',
    description: 'Custom Markdown instructions appended to the system prompt for every conversation.',
  },
  'recordings.autoAnalyze': {
    schema: booleanSetting,
    default: 'false',
    description: 'Automatically run transcription and LLM analysis when a recording is completed.',
  },
  'recordings.inputDeviceId': {
    schema: z.string(),
    default: '',
    description: 'Preferred microphone device name. Empty string uses the system default.',
  },
  'recordings.outputDeviceId': {
    schema: z.string(),
    default: '',
    description: 'Preferred speaker device name for system audio capture. Empty string uses the system default.',
  },
  'recordings.transcription.providerId': {
    schema: z.string(),
    default: '',
    description: 'Preferred provider ID used for recording transcription.',
  },
  'recordings.transcription.modelId': {
    schema: z.string(),
    default: '',
    description: 'Preferred model ID used for recording transcription.',
  },
  'recordings.analysis.providerId': {
    schema: z.string(),
    default: '',
    description: 'Preferred provider ID used for recording analysis and summaries.',
  },
  'recordings.analysis.modelId': {
    schema: z.string(),
    default: '',
    description: 'Preferred model ID used for recording analysis and summaries.',
  },
  'recordings.analysis.defaultTemplateId': {
    schema: z.string(),
    default: 'mnt_prebuilt_executive_summary',
    description: 'Default meeting note template used for recording analysis.',
  },
  'stt.default.providerId': {
    schema: z.string(),
    default: '',
    description: 'Provider ID for the default STT model used for live speech-to-text in the chat input.',
  },
  'stt.default.modelId': {
    schema: z.string(),
    default: '',
    description: 'Model ID for the default STT model used for live speech-to-text in the chat input.',
  },
  'stt.holdToTalk': {
    schema: booleanSetting,
    default: 'false',
    description:
      'When enabled, the dictation shortcut records only while held and finalizes on release (push-to-talk). When disabled, the shortcut toggles recording on and off.',
  },
  'mail.alwaysLoadRemoteImages': {
    schema: booleanSetting,
    default: 'true',
    description: 'Always load remote images in Mail message bodies.',
  },
  'telemetry.serverId': {
    schema: z.string().max(80),
    default: '',
    description: 'Anonymous server installation identifier for telemetry.',
  },
} as const;

export type SettingsKey = keyof typeof SETTINGS_REGISTRY;

export const SETTINGS_SCHEMAS: { [K in SettingsKey]: (typeof SETTINGS_REGISTRY)[K]['schema'] } = Object.fromEntries(
  Object.entries(SETTINGS_REGISTRY).map(([key, entry]) => [key, entry.schema]),
) as { [K in SettingsKey]: (typeof SETTINGS_REGISTRY)[K]['schema'] };

type SettingDefault = { key: SettingsKey; value: string; description: string };

export const SETTINGS_DEFAULTS: SettingDefault[] = Object.entries(SETTINGS_REGISTRY).map(([key, entry]) => ({
  key: key as SettingsKey,
  value: entry.default,
  description: entry.description,
}));

export function isValidLeaderKeyHotkey(value: string): boolean {
  return SETTINGS_SCHEMAS['shortcuts.leaderKey'].safeParse(value).success;
}
