import { readFileSync } from 'node:fs';

import { createRegisteredTool } from '@/tools/core/browser.js';
import type { ToolProvider } from '@/tools/providers/types.js';
import type { Toolset } from '@/tools/toolsets/types.js';
import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';

const browserInstructions = readFileSync(
  resolveRuntimeAssetPath(new URL('./instructions/browser.md', import.meta.url), 'tools/providers/instructions/browser.md'),
  'utf8',
).trim();

export const browserToolProvider: ToolProvider = {
  name: 'browser',
  knownTools: () => [{ toolType: 'stitch', toolName: 'browser', displayName: 'Browser' }],
  createTools: (context) => ({
    browser: createRegisteredTool(context),
  }),
};

export const browserToolset: Toolset = {
  id: 'browser',
  name: 'Browser',
  description:
    'Control a Chrome browser: navigate pages, click elements, type text, take screenshots, and interact with web applications.',
  instructions: browserInstructions,
  tools: () => [
    {
      name: 'browser',
      description:
        'Control a Chrome browser instance with actions like navigate, click, type, screenshot, scroll, and evaluate JavaScript.',
    },
  ],
  activate: async (context) => browserToolProvider.createTools(context),
};
