import type { PrefixedString } from '@stitch/shared/id';

type InteractionKind = 'permission' | 'question' | 'doom_loop' | 'mcp_elicitation';

export type PendingInteractionSnapshot<TPayload = unknown> = {
  id: string;
  kind: InteractionKind;
  sessionId: PrefixedString<'ses'>;
  streamRunId?: string;
  createdAt: number;
  payload?: TPayload;
};

export type InteractionWaitOptions<TDecision, TPayload = unknown> = {
  id: string;
  kind: InteractionKind;
  sessionId: PrefixedString<'ses'>;
  streamRunId?: string;
  payload?: TPayload;
  dedupeKey?: string;
  abortSignal?: AbortSignal;
  abortError?: () => Error;
  timeoutMs?: number;
  onTimeout?: () => TDecision | Promise<TDecision>;
  onDuplicate?: () => TDecision | Promise<TDecision>;
};

export type AbortSessionOptions = { sessionId: PrefixedString<'ses'>; kind?: InteractionKind; error?: Error };

export type ListInteractionsFilter = { sessionId?: PrefixedString<'ses'>; kind?: InteractionKind };
