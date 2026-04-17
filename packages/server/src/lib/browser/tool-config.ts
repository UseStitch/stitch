import { readFileSync } from 'node:fs';

import type { ToolType } from '@stitch/shared/tools/types';

import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';

type KnownTool = {
  toolType: ToolType;
  toolName: string;
  displayName: string;
};

const BROWSER_KNOWN_TOOLS: KnownTool[] = [
  { toolType: 'plugin', toolName: 'browser', displayName: 'Browser' },
];

export const BROWSER_TOOL_INSTRUCTIONS = readFileSync(
  resolveRuntimeAssetPath(
    new URL('./instructions/browser.md', import.meta.url),
    'lib/browser/instructions/browser.md',
  ),
  'utf8',
).trim();

export function getBrowserKnownTools(): KnownTool[] {
  return BROWSER_KNOWN_TOOLS;
}
