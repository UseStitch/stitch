import type { PrefixedString } from '@stitch/shared/id';

import { resolveDecision } from '@/llm/stream/doom-loop.js';
import { abort } from '@/llm/stream/session-run-coordinator.js';
import { abortMcpElicitations } from '@/mcp/elicitation-service.js';
import { abortPermissionResponses } from '@/permission/service.js';
import { abortQuestions } from '@/question/service.js';

export async function abortSessionInteractions(sessionId: PrefixedString<'ses'>): Promise<void> {
  abort(sessionId);
  resolveDecision(sessionId, 'stop');
  await Promise.all([abortQuestions(sessionId), abortPermissionResponses(sessionId), abortMcpElicitations(sessionId)]);
}
