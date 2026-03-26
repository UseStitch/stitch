import type { AgentToolType } from '@stitch/shared/agents/types';
import type { PrefixedString } from '@stitch/shared/id';

import * as BashTool from '@/tools/bash.js';
import * as EditTool from '@/tools/edit.js';
import * as GlobTool from '@/tools/glob.js';
import * as GrepTool from '@/tools/grep.js';
import * as QuestionTool from '@/tools/question.js';
import * as ReadTool from '@/tools/read.js';
import * as WebfetchTool from '@/tools/webfetch.js';
import * as WriteTool from '@/tools/write.js';

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL - FINAL STEP ${max}/${max}\n\nThis is the last allowed step for this run.\n\nSTRICT REQUIREMENTS:\n1. Do NOT call any tools.\n2. MUST provide a user-facing text response summarizing work done so far.\n3. If anything is incomplete, clearly list what remains and what to do next.\n4. This overrides all other instructions that suggest additional tool use.`;

type KnownTool = { toolType: AgentToolType; toolName: string; displayName: string };

const STITCH_TOOL_MODULES = {
  webfetch: WebfetchTool,
  question: QuestionTool,
  read: ReadTool,
  bash: BashTool,
  glob: GlobTool,
  grep: GrepTool,
  edit: EditTool,
  write: WriteTool,
} as const;

export const STITCH_KNOWN_TOOLS: KnownTool[] = Object.entries(STITCH_TOOL_MODULES).map(
  ([name, mod]) => ({
    toolType: 'stitch',
    toolName: name,
    displayName: mod.DISPLAY_NAME,
  }),
);

export function createTools(context: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  agentId: PrefixedString<'agt'>;
  streamRunId: string;
  subAgentId?: PrefixedString<'agt'>;
}) {
  return Object.fromEntries(
    Object.entries(STITCH_TOOL_MODULES).map(([name, mod]) => [
      name,
      mod.createRegisteredTool(context),
    ]),
  );
}
