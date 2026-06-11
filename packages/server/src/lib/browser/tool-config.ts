import { readFileSync } from 'node:fs';

import { resolveRuntimeAssetPath } from '@/lib/runtime-assets.js';

export const BROWSER_TOOL_INSTRUCTIONS = readFileSync(
  resolveRuntimeAssetPath(
    new URL('./instructions/browser.md', import.meta.url),
    'lib/browser/instructions/browser.md',
  ),
  'utf8',
).trim();
