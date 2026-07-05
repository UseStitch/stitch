import type {
  AbortSessionOptions,
  InteractionWaitOptions,
  PendingInteractionSnapshot,
} from '@/lib/interactions/types.js';

type PendingInteraction = PendingInteractionSnapshot & {
  resolve: (decision: unknown) => void;
  reject: (error: Error) => void;
  abortError: () => Error;
  cleanup: () => void;
};

class InteractionAbortedError extends Error {
  constructor(message = 'Interaction aborted') {
    super(message);
    this.name = 'InteractionAbortedError';
  }
}

const defaultAbortError = () => new InteractionAbortedError();

export class InteractionBroker {
  private readonly pending = new Map<string, PendingInteraction>();

  wait<TDecision>(opts: InteractionWaitOptions<TDecision>): Promise<TDecision> {
    const existing = this.pending.get(opts.id);
    if (existing) {
      void this.resolveDuplicate(existing, opts.onDuplicate);
    }

    return new Promise<TDecision>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const abortError = opts.abortError ?? defaultAbortError;
      let pendingEntry: PendingInteraction;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        opts.abortSignal?.removeEventListener('abort', abortHandler);
        if (this.pending.get(opts.id) === pendingEntry) {
          this.pending.delete(opts.id);
        }
      };

      const settleResolve = (decision: unknown) => {
        cleanup();
        resolve(decision as TDecision);
      };

      const settleReject = (error: Error) => {
        cleanup();
        reject(error);
      };

      const abortHandler = () => {
        settleReject(abortError());
      };

      if (opts.abortSignal) {
        if (opts.abortSignal.aborted) {
          reject(abortError());
          return;
        }
        opts.abortSignal.addEventListener('abort', abortHandler, { once: true });
      }

      if (opts.timeoutMs !== undefined && opts.onTimeout) {
        timeout = setTimeout(() => {
          Promise.resolve(opts.onTimeout?.())
            .then(settleResolve)
            .catch((error: unknown) => settleReject(error instanceof Error ? error : new Error(String(error))));
        }, opts.timeoutMs);
      }

      pendingEntry = {
        id: opts.id,
        kind: opts.kind,
        sessionId: opts.sessionId,
        streamRunId: opts.streamRunId,
        resolve: settleResolve,
        reject: settleReject,
        abortError,
        cleanup,
      };
      this.pending.set(opts.id, pendingEntry);
    });
  }

  resolve<TDecision>(id: string, decision: TDecision): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;

    entry.resolve(decision);
    return true;
  }

  reject(id: string, error: Error): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;

    entry.reject(error);
    return true;
  }

  abortSession(opts: AbortSessionOptions): PendingInteractionSnapshot[] {
    const aborted = [...this.pending.values()].filter(
      (entry) => entry.sessionId === opts.sessionId && (!opts.kind || entry.kind === opts.kind),
    );

    for (const entry of aborted) {
      entry.reject(opts.error ?? entry.abortError());
    }

    return aborted.map(toSnapshot);
  }

  get(id: string): PendingInteractionSnapshot | undefined {
    const entry = this.pending.get(id);
    return entry ? toSnapshot(entry) : undefined;
  }

  clear(): void {
    for (const entry of this.pending.values()) {
      entry.cleanup();
    }
    this.pending.clear();
  }

  private async resolveDuplicate<TDecision>(
    entry: PendingInteraction,
    onDuplicate: (() => TDecision | Promise<TDecision>) | undefined,
  ): Promise<void> {
    if (!onDuplicate) {
      entry.reject(entry.abortError());
      return;
    }

    try {
      entry.resolve(await onDuplicate());
    } catch (error) {
      entry.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const interactionBroker = new InteractionBroker();

function toSnapshot(entry: PendingInteraction): PendingInteractionSnapshot {
  return { id: entry.id, kind: entry.kind, sessionId: entry.sessionId, streamRunId: entry.streamRunId };
}
