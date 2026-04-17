import { BROWSER_TOOL_INSTRUCTIONS } from '@/lib/browser/tool-config.js';
import { createRegisteredTool } from '@/tools/core/browser.js';
import type { Toolset } from '@/tools/toolsets/types.js';

export function createBrowserToolset(): Toolset {
  return {
    id: 'browser',
    name: 'Browser',
    description:
      'Control a Chrome browser: navigate pages, click elements, type text, take screenshots, and interact with web applications.',
    instructions: BROWSER_TOOL_INSTRUCTIONS,
    tools: () => [
      {
        name: 'browser',
        description:
          'Control a Chrome browser instance with actions like navigate, click, type, screenshot, scroll, and evaluate JavaScript.',
      },
    ],
    activate: async (context) => ({
      browser: createRegisteredTool(context),
    }),
  };
}
