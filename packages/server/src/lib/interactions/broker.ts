import type {
  AbortSessionOptions,
  InteractionWaitOptions,
  ListInteractionsFilter,
  PendingInteractionSnapshot,
} from '@/lib/interactions/types.js';

type PendingInteraction<TPayload = unknown> = PendingInteractionSnapshot<TPayload> & {
  dedupeKey?: string;
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
  private readonly byDedupeKey = new Map<string, Promise<unknown>>();

  wait<TDecision, TPayload = unknown>(opts: InteractionWaitOptions<TDecision, TPayload>): Promise<TDecision> {
    if (opts.dedupeKey) {
      const inFlight = this.byDedupeKey.get(opts.dedupeKey);
      if (inFlight) {
        return inFlight as Promise<TDecision>;
      }
    }

    const existing = this.pending.get(opts.id);
    if (existing) {
      void this.resolveDuplicate(existing, opts.onDuplicate);
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abortError = opts.abortError ?? defaultAbortError;
    let pendingEntry: PendingInteraction<TPayload>;

    const promise = new Promise<TDecision>((resolve, reject) => {
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        opts.abortSignal?.removeEventListener('abort', abortHandler);
        if (this.pending.get(opts.id) === pendingEntry) {
          this.pending.delete(opts.id);
        }
        if (opts.dedupeKey && this.byDedupeKey.get(opts.dedupeKey) === promise) {
          this.byDedupeKey.delete(opts.dedupeKey);
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
            .catch((error: unknown) => settleReject(Error.isError(error) ? error : new Error(String(error))));
        }, opts.timeoutMs);
      }

      pendingEntry = {
        id: opts.id,
        kind: opts.kind,
        sessionId: opts.sessionId,
        streamRunId: opts.streamRunId,
        createdAt: Date.now(),
        payload: opts.payload,
        dedupeKey: opts.dedupeKey,
        resolve: settleResolve,
        reject: settleReject,
        abortError,
        cleanup,
      };
      this.pending.set(opts.id, pendingEntry as PendingInteraction);
    });

    if (opts.dedupeKey) {
      this.byDedupeKey.set(opts.dedupeKey, promise);
    }

    return promise;
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

  get<TPayload = unknown>(id: string): PendingInteractionSnapshot<TPayload> | undefined {
    const entry = this.pending.get(id);
    return entry ? (toSnapshot(entry) as PendingInteractionSnapshot<TPayload>) : undefined;
  }

  getDedupe<TDecision>(dedupeKey: string): Promise<TDecision> | undefined {
    return this.byDedupeKey.get(dedupeKey) as Promise<TDecision> | undefined;
  }

  has(id: string): boolean {
    return this.pending.has(id);
  }

  list(filter?: ListInteractionsFilter): PendingInteractionSnapshot[] {
    let entries = [...this.pending.values()];
    if (filter?.sessionId) {
      entries = entries.filter((e) => e.sessionId === filter.sessionId);
    }
    if (filter?.kind) {
      entries = entries.filter((e) => e.kind === filter.kind);
    }
    return entries.map(toSnapshot);
  }

  clear(): void {
    for (const entry of this.pending.values()) {
      entry.cleanup();
    }
    this.pending.clear();
    this.byDedupeKey.clear();
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
      entry.reject(Error.isError(error) ? error : new Error(String(error)));
    }
  }
}

export const interactionBroker = new InteractionBroker();

function toSnapshot<TPayload>(entry: PendingInteraction<TPayload>): PendingInteractionSnapshot<TPayload> {
  return {
    id: entry.id,
    kind: entry.kind,
    sessionId: entry.sessionId,
    streamRunId: entry.streamRunId,
    createdAt: entry.createdAt,
    payload: entry.payload,
  };
}
