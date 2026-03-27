import type { PrefixedString } from '@stitch/shared/id';

import { executeStepWithRetry, type StepOptions } from './step-executor.js';

import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
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

export type ToolCallRecord = {
  toolName: string;
  inputJson: string;
};

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

// ─── Promise registry ─────────────────────────────────────────────────────────
// One pending prompt per session at a time.

type PendingDecision = {
  resolve: (response: DoomLoopResponse) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<PrefixedString<'ses'>, PendingDecision>();

/**
 * Pause execution until the user responds via the API endpoint.
 * Automatically resolves with `'stop'` after `DECISION_TIMEOUT_MS`.
 */
export function waitForUserDecision(sessionId: PrefixedString<'ses'>): Promise<DoomLoopResponse> {
  // If there is already a pending prompt for this session, resolve it first.
  const existing = pending.get(sessionId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.resolve('stop');
    pending.delete(sessionId);
  }

  return new Promise<DoomLoopResponse>((resolve) => {
    const timer = setTimeout(() => {
      log.warn({ sessionId }, 'doom loop decision timed out, auto-stopping');
      pending.delete(sessionId);
      resolve('stop');
    }, DECISION_TIMEOUT_MS);

    pending.set(sessionId, { resolve, timer });
  });
}

/**
 * Called from the API route when the user picks "Continue" or "Stop".
 * Returns `false` if there was no pending prompt for the session.
 */
export function resolveDecision(
  sessionId: PrefixedString<'ses'>,
  response: DoomLoopResponse,
): boolean {
  const entry = pending.get(sessionId);
  if (!entry) return false;

  clearTimeout(entry.timer);
  entry.resolve(response);
  pending.delete(sessionId);
  return true;
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
};

export async function checkAndHandleDoomLoop(opts: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  toolCallHistory: ToolCallRecord[];
  conversation: ModelMessage[];
  stepOptions: StepOptions;
  currentState: DoomLoopState;
}): Promise<DoomLoopState> {
  const { sessionId, messageId, toolCallHistory, conversation, stepOptions, currentState } = opts;

  if (!isDoomLoop(toolCallHistory)) {
    return currentState;
  }

  const repeatedTool = toolCallHistory[toolCallHistory.length - 1].toolName;

  log.warn(
    {
      sessionId,
      messageId,
      toolName: repeatedTool,
      consecutiveCount: DOOM_LOOP_THRESHOLD,
    },
    'doom loop detected',
  );

  await Sse.broadcast('doom-loop-detected', {
    sessionId,
    messageId,
    toolName: repeatedTool,
    consecutiveCount: DOOM_LOOP_THRESHOLD,
  });

  const decision = await waitForUserDecision(sessionId);

  if (decision === 'stop') {
    log.info({ sessionId }, 'user stopped doom loop');

    conversation.push({
      role: 'user',
      content: DOOM_LOOP_MESSAGE,
    });

    const summaryResult = await executeStepWithRetry({
      ...stepOptions,
      conversation,
    });

    const newUsage = Usage.addUsage(currentState.totalUsage, summaryResult.usage);

    for (const msg of summaryResult.responseMessages) {
      conversation.push(msg);
    }

    return {
      totalUsage: newUsage,
      finalFinishReason: summaryResult.finishReason,
      isStopped: true,
    };
  }

  // User chose 'continue' — proceed as normal
  log.info({ sessionId }, 'user continued past doom loop');
  return currentState;
}
