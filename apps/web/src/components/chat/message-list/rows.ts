import { toUserFacingStreamError } from '@stitch/shared/chat/errors';
import type { Message } from '@stitch/shared/chat/messages';

import type { SessionStreamState } from '@/stores/stream-store';

export const ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 8;
export const BASE_MESSAGE_HEIGHT_ESTIMATE = 200;
const MESSAGE_HEIGHT_PER_CHAR = 20;

export type RowData =
  | { kind: 'load-more' }
  | {
      kind: 'message';
      id: string;
      role: 'user' | 'assistant';
      parts: Message['parts'];
      finishReason: Message['finishReason'];
      isFirstUserMessage: boolean;
    }
  | { kind: 'compaction'; id: string; summaryParts?: Message['parts'] }
  | { kind: 'streaming' }
  | { kind: 'error'; title: string; message: string; suggestion?: string };

export function buildRows(
  messages: Message[],
  streamState: SessionStreamState,
  hasMore: boolean,
  isFetchingMore: boolean,
): RowData[] {
  const rows: RowData[] = [];

  if (hasMore || isFetchingMore) {
    rows.push({ kind: 'load-more' });
  }

  const summaryByMarker = new Map<string, Message>();
  const pairedSummaryIds = new Set<string>();

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (
      message.parts.some(
        (part) =>
          part.type === 'session-title' ||
          part.type === 'automation-generation',
      )
    ) {
      continue;
    }

    if (message.role === 'user' && message.parts.some((part) => part.type === 'compaction')) {
      const next = messages[i + 1];
      if (next?.isSummary) {
        summaryByMarker.set(message.id, next);
        pairedSummaryIds.add(next.id);
      }
    }
  }

  for (const message of messages) {
    if (
      message.parts.some(
        (part) =>
          part.type === 'session-title' ||
          part.type === 'automation-generation',
      )
    ) {
      continue;
    }

    if (message.role === 'user' && message.parts.some((part) => part.type === 'compaction')) {
      const summary = summaryByMarker.get(message.id);
      rows.push({ kind: 'compaction', id: message.id, summaryParts: summary?.parts });
      continue;
    }

    if (pairedSummaryIds.has(message.id)) continue;
    if (message.role !== 'user' && message.role !== 'assistant') continue;

    const isFirstUserMessage =
      message.role === 'user' && !rows.some((row) => row.kind === 'message' && row.role === 'user');

    rows.push({
      kind: 'message',
      id: message.id,
      role: message.role,
      parts: message.parts,
      finishReason: message.finishReason,
      isFirstUserMessage,
    });
  }

  const hasStreamContent =
    streamState.isStreaming || streamState.partIds.length > 0 || streamState.error !== null;

  const persistedMessageLanded =
    streamState.activeMessageId !== null &&
    messages.some((message) => message.id === streamState.activeMessageId);

  if (hasStreamContent && !persistedMessageLanded) {
    if (streamState.error) {
      const userFacing = toUserFacingStreamError({
        error: streamState.error.message,
        details: streamState.error.details,
      });
      rows.push({
        kind: 'error',
        title: userFacing.title,
        message: userFacing.message,
        suggestion: userFacing.suggestion,
      });
    } else {
      rows.push({ kind: 'streaming' });
    }
  }

  return rows;
}

export function estimateRowHeight(row: RowData): number {
  if (row.kind === 'load-more') return 48;
  if (row.kind === 'compaction') return 60;
  if (row.kind === 'streaming') return 60;
  if (row.kind === 'error') return 80;

  if (row.kind === 'message') {
    const textContent = row.parts
      .filter((part) => part.type === 'text-delta')
      .map((part) => (part as { type: 'text-delta'; text: string }).text)
      .join('');

    const charCount = textContent.length;
    const hasCodeBlocks = textContent.includes('```');
    const hasReasoning = row.parts.some((part) => part.type === 'reasoning-delta');
    const hasToolCalls = row.parts.some((part) => part.type === 'tool-call');

    let estimate = BASE_MESSAGE_HEIGHT_ESTIMATE + charCount * MESSAGE_HEIGHT_PER_CHAR;
    if (hasCodeBlocks) estimate += 200;
    if (hasReasoning) estimate += 100;
    if (hasToolCalls) estimate += 50;

    return Math.min(Math.max(estimate, 80), 1500);
  }

  return BASE_MESSAGE_HEIGHT_ESTIMATE;
}
