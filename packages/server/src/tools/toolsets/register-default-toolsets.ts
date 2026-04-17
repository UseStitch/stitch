import { createAgendaToolset } from '@/tools/toolsets/agenda.js';
import { createBrowserToolset } from '@/tools/toolsets/browser.js';
import { createRecordingsToolset } from '@/tools/toolsets/recordings.js';
import { registerToolset } from '@/tools/toolsets/registry.js';
import { createSessionHistoryToolset } from '@/tools/toolsets/session-history.js';

export function registerDefaultToolsets(): void {
  registerToolset(createBrowserToolset());
  registerToolset(createAgendaToolset());
  registerToolset(createSessionHistoryToolset());
  registerToolset(createRecordingsToolset());
}
