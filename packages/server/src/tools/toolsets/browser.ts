import { BROWSER_TOOL_INSTRUCTIONS } from '@/lib/browser/tool-config.js';
import { createRegisteredTools } from '@/tools/core/browser.js';
import { TOOLSET_SUMMARY_CONTEXT, summarizeTools, type Toolset } from '@/tools/toolsets/types.js';

export function createBrowserToolset(): Toolset {
  return {
    id: 'browser',
    kind: 'native',
    name: 'Browser',
    description:
      'Control a Chrome browser: navigate pages, click elements, type text, take screenshots, and interact with web applications.',
    instructions: BROWSER_TOOL_INSTRUCTIONS,
    tools: () => summarizeTools(createRegisteredTools(TOOLSET_SUMMARY_CONTEXT)),
    activate: async (context) => createRegisteredTools(context),
  };
}
