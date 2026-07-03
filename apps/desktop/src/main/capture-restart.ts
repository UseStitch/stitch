/**
 * Capture warning codes that mean the native audio stream has died and the
 * whole capture pipeline must be rebuilt (see packages/audio-capture types.rs).
 */
const RESTART_TRIGGER_CODES: ReadonlySet<string> = new Set([
  'mic_stream_ended',
  'speaker_stream_ended',
  'mic_resample_failed',
  'speaker_resample_failed',
  'aec_resample_failed',
]);

export function isRestartTriggerCode(code: string): boolean {
  return RESTART_TRIGGER_CODES.has(code);
}

type CaptureRestarterOptions = {
  restart: () => Promise<void>;
  onGiveUp: (message: string) => void;
  /** Delay between a trigger and the restart; coalesces bursts (e.g. Bluetooth connect). */
  debounceMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
};

export type CaptureRestarter = {
  trigger: () => void;
  cancel: () => void;
};

/**
 * Supervises an audio capture session: device changes and stream-death
 * warnings trigger a debounced restart; failed restarts are retried with
 * backoff until `maxAttempts`, after which `onGiveUp` is called.
 */
export function createCaptureRestarter(options: CaptureRestarterOptions): CaptureRestarter {
  const debounceMs = options.debounceMs ?? 1000;
  const maxAttempts = options.maxAttempts ?? 3;
  const backoffMs = options.backoffMs ?? 500;

  let timer: NodeJS.Timeout | null = null;
  let restarting = false;
  let retrigger = false;
  let attempts = 0;
  let cancelled = false;

  function schedule(delayMs: number): void {
    if (cancelled || timer) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  }

  async function run(): Promise<void> {
    if (cancelled) {
      return;
    }
    restarting = true;
    try {
      await options.restart();
      attempts = 0;
      if (retrigger) {
        retrigger = false;
        schedule(debounceMs);
      }
    } catch (error) {
      retrigger = false;
      attempts += 1;
      if (cancelled) {
        return;
      }
      if (attempts >= maxAttempts) {
        options.onGiveUp(error instanceof Error ? error.message : String(error));
      } else {
        schedule(backoffMs * attempts);
      }
    } finally {
      restarting = false;
    }
  }

  return {
    trigger(): void {
      if (cancelled) {
        return;
      }
      if (restarting) {
        retrigger = true;
        return;
      }
      schedule(debounceMs);
    },
    cancel(): void {
      cancelled = true;
      retrigger = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
