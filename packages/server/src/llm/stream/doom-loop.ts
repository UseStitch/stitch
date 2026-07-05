import type { PrefixedString } from '@stitch/shared/id';

import { executeStepWithRetry, type StepOptions } from './step-executor.js';

import { interactionBroker } from '@/lib/interactions/broker.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import * as Usage from '@/utils/usage.js';
import type { LanguageModelUsage, ModelMessage } from 'ai';

const log = Log.create({ service: 'doom-loop' });

const DOOM_LOOP_THRESHOLD = 3;

const DOOM_LOOP_MESSAGE =
  'The user has stopped your execution because you were repeating the same action. ' +
  'Provide a brief summary of what you have done so far and what remains to be completed.';

/** Timeout (ms) before an unresolved doom-loop prompt auto-stops. */
const DECISION_TIMEOUT_MS = 5 * 60 * 1000;

export type DoomLoopResponse = 'continue' | 'stop';

export type ToolCallRecord = { toolName: string; inputJson: string };

/**
 * Returns `true` when the last `DOOM_LOOP_THRESHOLD` entries in `history` are
 * identical (same tool name and JSON-serialized input).
 */
export function isDoomLoop(history: ToolCallRecord[]): boolean {
  if (history.length < DOOM_LOOP_THRESHOLD) return false;

  const tail = history.slice(-DOOM_LOOP_THRESHOLD);
  const first = tail[0];
  return tail.every((r) => r.toolName === first.toolName && r.inputJson === first.inputJson);
}

/**
 * Pause execution until the user responds via the API endpoint.
 * Automatically resolves with `'stop'` after `DECISION_TIMEOUT_MS`.
 */
export function waitForUserDecision(sessionId: PrefixedString<'ses'>): Promise<DoomLoopResponse> {
  return interactionBroker.wait<DoomLoopResponse>({
    id: sessionId,
    kind: 'doom_loop',
    sessionId,
    timeoutMs: DECISION_TIMEOUT_MS,
    onTimeout: () => {
      log.warn({ sessionId }, 'doom loop decision timed out, auto-stopping');
      return 'stop';
    },
    onDuplicate: () => 'stop',
  });
}

/**
 * Called from the API route when the user picks "Continue" or "Stop".
 * Returns `false` if there was no pending prompt for the session.
 */
export function resolveDecision(sessionId: PrefixedString<'ses'>, response: DoomLoopResponse): boolean {
  return interactionBroker.resolve(sessionId, response);
}

/**
 * Cancel a pending doom-loop decision by resolving it with 'stop'.
 * Called when the session is aborted.
 */
export function cancelDecision(sessionId: PrefixedString<'ses'>): void {
  resolveDecision(sessionId, 'stop');
}

type DoomLoopState = {
  totalUsage: LanguageModelUsage;
  finalFinishReason: string;
  isStopped: boolean;
  summaryUsage?: LanguageModelUsage;
};

export async function checkAndHandleDoomLoop(opts: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallHistory: ToolCallRecord[];
  conversation: ModelMessage[];
  stepOptions: StepOptions;
  currentState: DoomLoopState;
  onDoomLoopAttemptFailure?: StepOptions['onAttemptFailure'];
}): Promise<DoomLoopState> {
  const { sessionId, messageId, toolCallHistory, conversation, stepOptions, currentState, onDoomLoopAttemptFailure } =
    opts;

  if (!isDoomLoop(toolCallHistory)) {
    return currentState;
  }

  const repeatedTool = toolCallHistory[toolCallHistory.length - 1].toolName;

  log.warn(
    { sessionId, messageId, toolName: repeatedTool, consecutiveCount: DOOM_LOOP_THRESHOLD },
    'doom loop detected',
  );

  internalBus.emit('stream.doom_loop.detected', {
    sessionId,
    messageId,
    toolName: repeatedTool,
    consecutiveCount: DOOM_LOOP_THRESHOLD,
  });

  const decision = await waitForUserDecision(sessionId);

  if (decision === 'stop') {
    log.info({ sessionId }, 'user stopped doom loop');

    conversation.push({ role: 'user', content: DOOM_LOOP_MESSAGE });

    // Use empty tools for the summary step
    const summaryResult = await executeStepWithRetry({
      ...stepOptions,
      tools: {},
      conversation,
      onAttemptFailure: onDoomLoopAttemptFailure,
    });

    const newUsage = Usage.addUsage(currentState.totalUsage, summaryResult.usage);

    for (const msg of summaryResult.responseMessages) {
      conversation.push(msg);
    }

    return {
      totalUsage: newUsage,
      finalFinishReason: summaryResult.finishReason,
      isStopped: true,
      summaryUsage: summaryResult.usage,
    };
  }

  // User chose 'continue' — proceed as normal
  log.info({ sessionId }, 'user continued past doom loop');
  return currentState;
}
