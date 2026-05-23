// Absolute wall-clock ceiling regardless of pause state — last-resort hang guard
const ABSOLUTE_TIMEOUT_MS = 5 * 60 * 1000;

// --- Pausable timer ---

export type PausableTimer = {
  pause: () => void;
  resume: () => void;
  getElapsed: (startedAt: number) => number;
  getPausedAt: () => number | null;
  getTotalPausedMs: () => number;
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
    getPausedAt: () => pausedAt,
    getTotalPausedMs: () => totalPausedMs,
  };
}

// --- Abort/timeout race utility ---

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
      reject(new Error(message));
      return;
    }
    abortSignal.addEventListener('abort', () => reject(new Error(message)), { once: true });
  });
}

export function createExecutionTimeoutRace(
  timer: PausableTimer,
  startedAt: number,
  timeoutMs: number,
): RaceGuard {
  let pausableTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let absoluteTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const promise = new Promise<never>((_, reject) => {
    const checkPausable = () => {
      const elapsed = timer.getElapsed(startedAt);
      if (elapsed >= timeoutMs) {
        timedOut = true;
        reject(new Error(`Code mode execution timed out after ${timeoutMs}ms`));
      } else {
        pausableTimeoutId = setTimeout(checkPausable, 100);
      }
    };
    pausableTimeoutId = setTimeout(checkPausable, 100);

    absoluteTimeoutId = setTimeout(() => {
      timedOut = true;
      reject(new Error(`Code mode execution exceeded absolute limit of ${ABSOLUTE_TIMEOUT_MS}ms`));
    }, ABSOLUTE_TIMEOUT_MS);
  });

  const cleanup = () => {
    if (pausableTimeoutId !== null) clearTimeout(pausableTimeoutId);
    if (absoluteTimeoutId !== null) clearTimeout(absoluteTimeoutId);
  };

  return { promise, cleanup, isTimedOut: () => timedOut };
}

// --- Tool timeout wrapper ---

export function wrapWithPausableTimeout(
  execute: (input: unknown, abortSignal?: AbortSignal) => Promise<unknown>,
  timer: PausableTimer,
  toolTimeoutMs: number,
  abortSignal?: AbortSignal,
): (input: unknown) => Promise<unknown> {
  return async (input) => {
    timer.pause();
    try {
      const toolTimeoutPromise = new Promise<never>((_, reject) => {
        const id = setTimeout(
          () => reject(new Error(`Tool call timed out after ${toolTimeoutMs}ms`)),
          toolTimeoutMs,
        );
        abortSignal?.addEventListener('abort', () => clearTimeout(id), { once: true });
      });

      const abortPromise = createAbortRace(abortSignal, 'Tool call aborted');

      const raceTargets: Promise<unknown>[] = [execute(input, abortSignal), toolTimeoutPromise];
      if (abortPromise !== null) raceTargets.push(abortPromise);

      return await Promise.race(raceTargets);
    } finally {
      timer.resume();
    }
  };
}
