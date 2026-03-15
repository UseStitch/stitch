import * as Log from '../lib/log.js';

const log = Log.create({ service: 'doom-loop' });

export const DOOM_LOOP_THRESHOLD = 3;

export const DOOM_LOOP_MESSAGE =
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

const pending = new Map<string, PendingDecision>();

/**
 * Pause execution until the user responds via the API endpoint.
 * Automatically resolves with `'stop'` after `DECISION_TIMEOUT_MS`.
 */
export function waitForUserDecision(sessionId: string): Promise<DoomLoopResponse> {
  // If there is already a pending prompt for this session, resolve it first.
  const existing = pending.get(sessionId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.resolve('stop');
    pending.delete(sessionId);
  }

  return new Promise<DoomLoopResponse>((resolve) => {
    const timer = setTimeout(() => {
      log.warn('doom loop decision timed out, auto-stopping', { sessionId });
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
export function resolveDecision(sessionId: string, response: DoomLoopResponse): boolean {
  const entry = pending.get(sessionId);
  if (!entry) return false;

  clearTimeout(entry.timer);
  entry.resolve(response);
  pending.delete(sessionId);
  return true;
}
