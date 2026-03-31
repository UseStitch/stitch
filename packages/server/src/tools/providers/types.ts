import type { ToolType } from '@stitch/shared/tools/types';

import type { ToolContext } from '@/tools/runtime/wrappers.js';
import type { Tool } from 'ai';

export type ToolProvider = {
  /** Human-readable name for logging */
  name: string;
  /** Tool name/type/displayName triples for the UI tool-config endpoint */
  knownTools: () => { toolType: ToolType; toolName: string; displayName: string }[];
  /** Create the actual tool instances for runtime use */
  createTools: (context: ToolContext) => Record<string, Tool>;
};
