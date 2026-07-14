const MIN_SIGNAL_TOKENS = 4;
const MIN_TOKEN_LENGTH = 3;
const CONTEXT_TAIL_CHARS = 500;

function countSignalTokens(text: string): number {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH).length;
}

/**
 * Build the memory retrieval query for a turn, or return null when the turn is
 * low-signal and should reuse the previous turn's cached memory context instead.
 */
export function buildRetrievalQuery(input: {
  userText: string;
  previousAssistantText: string | null;
  contextAwareQuery: boolean;
  skipLowSignal: boolean;
}): string | null {
  const { userText, previousAssistantText, contextAwareQuery, skipLowSignal } = input;

  if (skipLowSignal && countSignalTokens(userText) < MIN_SIGNAL_TOKENS) {
    return null;
  }

  if (contextAwareQuery && previousAssistantText) {
    return `${previousAssistantText.slice(-CONTEXT_TAIL_CHARS)}\n${userText}`;
  }

  return userText;
}
