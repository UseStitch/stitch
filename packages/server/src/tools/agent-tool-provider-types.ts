import type { AgentKind, AgentToolType } from '@stitch/shared/agents/types';
import type { PrefixedString } from '@stitch/shared/id';

import type { ToolContext } from '@/tools/wrappers.js';
import type { Tool } from 'ai';

export type AgentInfo = {
  id: PrefixedString<'agt'>;
  name: string;
  kind: AgentKind | null;
};

export type AgentToolProvider = {
  /** Human-readable name for logging */
  name: string;
  /** Return true if this provider should inject tools for the given agent */
  appliesTo: (agent: AgentInfo) => boolean;
  /** Tool name/type pairs for the UI tool-config endpoint */
  knownTools: () => { toolType: AgentToolType; toolName: string }[];
  /** Create the actual tool instances for runtime use */
  createTools: (context: ToolContext) => Record<string, Tool>;
};
