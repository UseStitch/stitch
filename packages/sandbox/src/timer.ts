import { SandboxAbsoluteTimeoutError, SandboxAbortError, SandboxTimeoutError } from './errors.js';

const ABSOLUTE_TIMEOUT_MS = 5 * 60 * 1000;

type PausableTimer = {
  pause: () => void;
  resume: () => void;
  getElapsed: (startedAt: number) => number;
};

export function createPausableTimer(): PausableTimer {
  let pausedAt: number | null = null;
  let totalPausedMs = 0;

  return {
    pause() {
      if (pausedAt === null) pausedAt = Date.now();
    },
    resume() {
      if (pausedAt !== null) {
        totalPausedMs += Date.now() - pausedAt;
        pausedAt = null;
      }
    },
    getElapsed(startedAt: number): number {
      const paused = pausedAt !== null ? Date.now() - pausedAt : 0;
      return Date.now() - startedAt - totalPausedMs - paused;
    },
  };
}

type RaceGuard = {
  promise: Promise<never>;
  cleanup: () => void;
  isTimedOut: () => boolean;
};

export function createAbortRace(
  abortSignal: AbortSignal | undefined,
  message: string,
): Promise<never> | null {
  if (abortSignal === undefined) return null;
  return new Promise<never>((_, reject) => {
    if (abortSignal.aborted) {
      reject(new SandboxAbortError(message));
      return;
    }
    abortSignal.addEventListener('abort', () => reject(new SandboxAbortError(message)), {
      once: true,
    });
  });
}

export function createExecutionTimeoutRace(
  timer: PausableTimer,
  startedAt: number,
  timeoutMs: number,
  onTimeout: () => void,
): RaceGuard {
  let pausableTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let absoluteTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const promise = new Promise<never>((_, reject) => {
    const checkPausable = () => {
      const elapsed = timer.getElapsed(startedAt);
      if (elapsed >= timeoutMs) {
        timedOut = true;
        onTimeout();
        reject(new SandboxTimeoutError(timeoutMs));
      } else {
        pausableTimeoutId = setTimeout(checkPausable, 100);
      }
    };
    pausableTimeoutId = setTimeout(checkPausable, 100);

    absoluteTimeoutId = setTimeout(() => {
      timedOut = true;
      onTimeout();
      reject(new SandboxAbsoluteTimeoutError(ABSOLUTE_TIMEOUT_MS));
    }, ABSOLUTE_TIMEOUT_MS);
  });

  const cleanup = () => {
    if (pausableTimeoutId !== null) clearTimeout(pausableTimeoutId);
    if (absoluteTimeoutId !== null) clearTimeout(absoluteTimeoutId);
  };

  return { promise, cleanup, isTimedOut: () => timedOut };
}
