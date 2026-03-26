import { BROWSER_AGENT_KIND } from '@/agents/browser-agent.js';
import { createRegisteredTool } from '@/tools/browser.js';
import type { AgentToolProvider } from '@/tools/agent-tool-provider-types.js';

export const browserToolProvider: AgentToolProvider = {
  name: 'browser',
  appliesTo: (agent) => agent.kind === BROWSER_AGENT_KIND,
  knownTools: () => [
    { toolType: 'stitch', toolName: 'browser', displayName: 'Browser' },
  ],
  createTools: (context) => ({
    browser: createRegisteredTool(context),
  }),
};
