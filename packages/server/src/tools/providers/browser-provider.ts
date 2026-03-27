import { BROWSER_AGENT_KIND } from '@/agents/builtins/browser.js';
import { createRegisteredTool } from '@/tools/core/browser.js';
import type { AgentToolProvider } from '@/tools/providers/types.js';

export const browserToolProvider: AgentToolProvider = {
  name: 'browser',
  appliesTo: (agent) => agent.kind === BROWSER_AGENT_KIND,
  knownTools: () => [{ toolType: 'stitch', toolName: 'browser', displayName: 'Browser' }],
  createTools: (context) => ({
    browser: createRegisteredTool(context),
  }),
};
