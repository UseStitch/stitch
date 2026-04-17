import { registerProviderToolsets } from '@/tools/providers/index.js';
import { createAgendaToolset } from '@/tools/toolsets/agenda.js';
import { registerToolset } from '@/tools/toolsets/registry.js';
import { createRecordingsToolset } from '@/tools/toolsets/recordings.js';
import { createSessionHistoryToolset } from '@/tools/toolsets/session-history.js';

export function registerDefaultToolsets(): void {
  registerProviderToolsets();
  registerToolset(createAgendaToolset());
  registerToolset(createSessionHistoryToolset());
  registerToolset(createRecordingsToolset());
}
