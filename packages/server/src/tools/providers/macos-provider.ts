import { readFileSync } from 'node:fs';

import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';
import { createRegisteredTool } from '@/tools/core/macos.js';
import type { ToolProvider } from '@/tools/providers/types.js';
import type { Toolset } from '@/tools/toolsets/types.js';

const macosInstructions = readFileSync(
  resolveRuntimeAssetPath(
    new URL('./instructions/macos.md', import.meta.url),
    'tools/providers/instructions/macos.md',
  ),
  'utf8',
).trim();

export const macosToolProvider: ToolProvider = {
  name: 'macos',
  knownTools: () => [{ toolType: 'stitch', toolName: 'applescript', displayName: 'AppleScript' }],
  createTools: (context) => ({
    applescript: createRegisteredTool(context),
  }),
};

export const macosToolset: Toolset = {
  id: 'macos',
  name: 'macOS',
  description:
    'Execute AppleScript to control macOS applications and system features — automate any scriptable app, manage files, send messages, and more.',
  instructions: macosInstructions,
  tools: () => [
    {
      name: 'applescript',
      description:
        'Execute AppleScript via osascript to control applications, automate workflows, and interact with macOS system features.',
    },
  ],
  activate: async (context) => macosToolProvider.createTools(context),
};
