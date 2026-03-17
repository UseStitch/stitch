import type { PrefixedString } from '@openwork/shared';

import * as QuestionTool from '@/tools/question.js';
import * as ReadTool from '@/tools/read.js';
import * as WebfetchTool from '@/tools/webfetch.js';
import * as EditTool from '@/tools/edit.js';
import * as WriteTool from '@/tools/write.js';
import * as GlobTool from '@/tools/glob.js';
import * as GrepTool from '@/tools/grep.js';
import * as BashTool from '@/tools/bash.js';

export const MAX_STEPS = 25;

export const MAX_STEPS_WARNING = (max: number) =>
  `CRITICAL: You are on step ${max} (final step). Tools will be disabled after this. Complete all remaining work and provide your final answer.`;

export function createTools(context: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  agentId: PrefixedString<'agt'>;
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
  };
}
