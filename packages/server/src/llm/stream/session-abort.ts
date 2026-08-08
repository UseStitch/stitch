import type { PrefixedString } from '@stitch/shared/id';

import * as AbortRegistry from '@/lib/abort-registry.js';
import { cancelDecision } from '@/llm/stream/doom-loop.js';
import { abortMcpElicitations } from '@/mcp/elicitation-service.js';
import { abortPermissionResponses } from '@/permission/service.js';
import { abortQuestions } from '@/question/service.js';

export async function abortSessionInteractions(sessionId: PrefixedString<'ses'>): Promise<void> {
  AbortRegistry.abort(sessionId);
  cancelDecision(sessionId);
  await Promise.all([
    abortQuestions(sessionId),
    abortPermissionResponses(sessionId),
    abortMcpElicitations(sessionId),
  ]);
}
