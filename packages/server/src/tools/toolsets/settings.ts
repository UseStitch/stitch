import { isDbInitialized } from '@/db/client.js';
import { getSettings } from '@/settings/service.js';
import type { SessionToolsetScope } from '@/tools/toolsets/types.js';

type ToolsetSettings = { defaultScope: SessionToolsetScope; ttlTurns: number };

const DEFAULT_TOOLSET_SETTINGS: ToolsetSettings = { defaultScope: 'ttl_turns', ttlTurns: 3 };

export async function getToolsetSettings(): Promise<ToolsetSettings> {
  if (!isDbInitialized()) return DEFAULT_TOOLSET_SETTINGS;

  const s = await getSettings(['toolsets.defaultScope', 'toolsets.ttlTurns'] as const);
  return { defaultScope: s['toolsets.defaultScope'], ttlTurns: s['toolsets.ttlTurns'] };
}
