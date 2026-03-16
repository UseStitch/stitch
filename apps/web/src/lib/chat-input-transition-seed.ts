const TRANSITION_CLEAR_DELAY_MS = 260;

let nextSessionInputSeed = '';

export function setNextSessionInputSeed(value: string) {
  nextSessionInputSeed = value;
}

export function consumeNextSessionInputSeed() {
  const value = nextSessionInputSeed;
  nextSessionInputSeed = '';
  return value;
}

export function getTransitionSeedClearDelayMs() {
  return TRANSITION_CLEAR_DELAY_MS;
}
