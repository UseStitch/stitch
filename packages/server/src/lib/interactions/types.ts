import type { PrefixedString } from '@stitch/shared/id';

type InteractionKind = 'permission' | 'question' | 'doom_loop';

export type PendingInteractionSnapshot = {
  id: string;
  kind: InteractionKind;
  sessionId: PrefixedString<'ses'>;
  streamRunId?: string;
};

export type InteractionWaitOptions<TDecision> = {
  id: string;
  kind: InteractionKind;
  sessionId: PrefixedString<'ses'>;
  streamRunId?: string;
  abortSignal?: AbortSignal;
  abortError?: () => Error;
  timeoutMs?: number;
  onTimeout?: () => TDecision | Promise<TDecision>;
  onDuplicate?: () => TDecision | Promise<TDecision>;
};

export type AbortSessionOptions = { sessionId: PrefixedString<'ses'>; kind?: InteractionKind; error?: Error };
