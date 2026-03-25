import type { PrefixedString } from '@stitch/shared/id';

import * as BashTool from '@/tools/bash.js';
import * as BrowserTool from '@/tools/browser.js';
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

export function createTools(context: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  agentId: PrefixedString<'agt'>;
  streamRunId: string;
  subAgentId?: PrefixedString<'agt'>;
}) {
  return {
    webfetch: WebfetchTool.createRegisteredTool(context),
    question: QuestionTool.createRegisteredTool(context),
    read: ReadTool.createRegisteredTool(context),
    bash: BashTool.createRegisteredTool(context),
    glob: GlobTool.createRegisteredTool(context),
    grep: GrepTool.createRegisteredTool(context),
    edit: EditTool.createRegisteredTool(context),
    write: WriteTool.createRegisteredTool(context),
    browser: BrowserTool.createRegisteredTool(context),
  };
}
