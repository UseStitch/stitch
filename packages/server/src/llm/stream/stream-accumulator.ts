import type { PartId, StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';
import { createPartId } from '@stitch/shared/id';

import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import { mapAIError, toStreamErrorDetails } from '@/llm/stream/ai-error-mapper.js';
import type { ToolCallRecord } from '@/llm/stream/doom-loop.js';
import {
  PermissionRejectedError,
  StreamAbortedError,
  StreamPartError,
  isPermissionRejectedError,
} from '@/llm/stream/errors.js';
import { stableStringify } from '@/utils/stable-stringify.js';

const log = Log.create({ service: 'stream-accumulator' });

type BufferedTextPart = { id: PartId; text: string; startedAt: number };

export class StreamAccumulator {
  private currentTextPart: BufferedTextPart | null = null;
  private currentReasoningPart: BufferedTextPart | null = null;
  private protocolViolationCount = 0;
  private permissionRejected: PermissionRejectedError | null = null;

  constructor(
    private readonly sessionId: PrefixedString<'ses'>,
    private readonly messageId: PrefixedString<'msg'>,
    private readonly step: number,
    private readonly accumulatedParts: StoredPart[],
    private readonly toolCalls: ToolCallRecord[],
    private readonly streamRunId: string,
    private readonly broadcast: typeof Sse.broadcast = Sse.broadcast,
  ) {}

  getProtocolViolationCount(): number {
    return this.protocolViolationCount;
  }

  getPermissionRejected(): PermissionRejectedError | null {
    return this.permissionRejected;
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────

  private getToolTruncationMeta(output: unknown): { truncated: boolean; outputPath?: string } {
    if (!output || typeof output !== 'object') {
      return { truncated: false };
    }

    const meta = (output as { __stitchToolResultMeta?: unknown }).__stitchToolResultMeta;
    if (!meta || typeof meta !== 'object') {
      return { truncated: false };
    }

    const truncated = (meta as { truncated?: unknown }).truncated === true;
    const outputPathRaw = (meta as { outputPath?: unknown }).outputPath;
    const outputPath = typeof outputPathRaw === 'string' ? outputPathRaw : undefined;
    return { truncated, outputPath };
  }

  private stripToolTruncationMeta(output: unknown): unknown {
    if (!output || typeof output !== 'object') {
      return output;
    }

    const clone = { ...(output as Record<string, unknown>) };
    delete clone.__stitchToolResultMeta;
    return clone;
  }

  private broadcastPartUpdate(partId: PartId, part: unknown): Promise<void> {
    return this.broadcast('stream-part-update', {
      sessionId: this.sessionId,
      messageId: this.messageId,
      partId,
      part: part as Parameters<typeof Sse.broadcast<'stream-part-update'>>[1]['part'],
    });
  }

  private broadcastPartDelta(partId: PartId, delta: unknown): Promise<void> {
    return this.broadcast('stream-part-delta', {
      sessionId: this.sessionId,
      messageId: this.messageId,
      partId,
      delta: delta as Parameters<typeof Sse.broadcast<'stream-part-delta'>>[1]['delta'],
    });
  }

  private async handleTextualStart(
    field: 'currentTextPart' | 'currentReasoningPart',
    part: unknown,
  ): Promise<void> {
    const partId = createPartId();
    this[field] = { id: partId, text: '', startedAt: Date.now() };
    await this.broadcastPartUpdate(partId, part);
  }

  private async handleTextualDelta(
    field: 'currentTextPart' | 'currentReasoningPart',
    violationName: string,
    part: { text: string },
  ): Promise<void> {
    const current = this[field];
    if (current) {
      current.text += part.text;
      await this.broadcastPartDelta(current.id, part);
    } else {
      this.protocolViolationCount++;
      log.warn(
        {
          event: 'stream.part.protocol_violation',
          streamRunId: this.streamRunId,
          sessionId: this.sessionId,
          messageId: this.messageId,
          step: this.step,
          violation: violationName,
        },
        'stream.part.protocol_violation',
      );
    }
  }

  private async handleTextualEnd(
    field: 'currentTextPart' | 'currentReasoningPart',
    storedType: 'text-delta' | 'reasoning-delta',
    part: unknown,
  ): Promise<void> {
    const current = this[field];
    if (current) {
      const now = Date.now();
      this.accumulatedParts.push({
        type: storedType,
        text: current.text,
        id: current.id,
        startedAt: current.startedAt,
        endedAt: now,
      } as StoredPart);
      await this.broadcastPartUpdate(current.id, part);
      this[field] = null;
    }
  }

  // ─── Main dispatcher ──────────────────────────────────────────────────────

  async handlePart(part: any): Promise<void> {
    log.debug(
      {
        event: 'stream.part.received',
        streamRunId: this.streamRunId,
        sessionId: this.sessionId,
        messageId: this.messageId,
        step: this.step,
        partType: String(part?.type ?? 'unknown'),
      },
      'stream.part.received',
    );

    switch (part.type) {
      case 'text-start':
        await this.handleTextualStart('currentTextPart', part);
        break;

      case 'text-delta':
        await this.handleTextualDelta('currentTextPart', 'text_delta_without_text_start', part);
        break;

      case 'text-end':
        await this.handleTextualEnd('currentTextPart', 'text-delta', part);
        break;

      case 'reasoning-start':
        await this.handleTextualStart('currentReasoningPart', part);
        break;

      case 'reasoning-delta':
        await this.handleTextualDelta(
          'currentReasoningPart',
          'reasoning_delta_without_reasoning_start',
          part,
        );
        break;

      case 'reasoning-end':
        await this.handleTextualEnd('currentReasoningPart', 'reasoning-delta', part);
        break;

      case 'source': {
        const now = Date.now();
        const partId = createPartId();
        this.accumulatedParts.push({ ...part, id: partId, startedAt: now, endedAt: now });
        await this.broadcastPartUpdate(partId, part);
        break;
      }

      case 'file': {
        const partId = createPartId();
        const now = Date.now();
        this.accumulatedParts.push({ ...part, id: partId, startedAt: now, endedAt: now });
        await this.broadcastPartUpdate(partId, part);
        break;
      }

      case 'tool-input-start':
        await this.broadcast('stream-tool-state', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          toolCallId: part.id,
          toolName: part.toolName,
          status: 'pending',
        });
        break;

      case 'tool-input-delta':
      case 'tool-input-end':
        // Not broadcast — input accumulation happens server-side only
        break;

      case 'tool-call': {
        const now = Date.now();
        const partId = createPartId();

        this.toolCalls.push({
          toolName: part.toolName,
          inputJson: stableStringify(part.input),
        });

        await this.broadcast('stream-tool-state', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: 'in-progress',
          input: part.input,
        });

        this.accumulatedParts.push({
          ...part,
          id: partId,
          toolCallId: part.toolCallId,
          startedAt: now,
          endedAt: now,
        } as StoredPart);
        break;
      }

      case 'tool-result': {
        const now = Date.now();
        const partId = createPartId();
        const truncationMeta = this.getToolTruncationMeta(part.output);
        const sanitizedOutput = this.stripToolTruncationMeta(part.output);

        await this.broadcast('stream-tool-state', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: 'completed',
          input: part.input,
          output: sanitizedOutput,
        });

        this.accumulatedParts.push({
          type: 'tool-result',
          id: partId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          output: sanitizedOutput,
          truncated: truncationMeta.truncated,
          outputPath: truncationMeta.outputPath,
          startedAt: now,
          endedAt: now,
        } as StoredPart);
        break;
      }

      case 'tool-error': {
        const now = Date.now();
        const partId = createPartId();
        const errorText = String(part.error);

        await this.broadcast('stream-tool-state', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: 'error',
          error: errorText,
        });

        log.warn(
          {
            event: 'stream.tool.error',
            streamRunId: this.streamRunId,
            sessionId: this.sessionId,
            messageId: this.messageId,
            step: this.step,
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            error: errorText,
          },
          'tool call failed',
        );

        this.accumulatedParts.push({
          type: 'tool-result',
          id: partId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: { error: errorText },
          truncated: false,
          startedAt: now,
          endedAt: now,
        } as StoredPart);

        if (isPermissionRejectedError(part.error)) {
          this.permissionRejected = new PermissionRejectedError(part.toolName ?? 'unknown');
        }
        break;
      }

      case 'error': {
        const mappedError = mapAIError(part.error);
        const errorText = mappedError.message;
        const errorName = part.error instanceof Error ? part.error.name : typeof part.error;
        const errorStack = part.error instanceof Error ? part.error.stack : undefined;
        log.error(
          {
            event: 'stream.part.error',
            streamRunId: this.streamRunId,
            sessionId: this.sessionId,
            messageId: this.messageId,
            step: this.step,
            error: errorText,
            errorName,
            errorStack,
            rawPartKeys:
              part && typeof part === 'object' ? Object.keys(part as Record<string, unknown>) : [],
          },
          'stream part error',
        );
        await this.broadcast('stream-error', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          error: errorText,
          details: toStreamErrorDetails(mappedError),
        });

        if (part.error instanceof Error) {
          throw new StreamPartError(part.error.message, { cause: part.error });
        }

        throw new StreamPartError(errorText);
      }

      case 'start-step':
      case 'finish-step':
        // Step lifecycle events are not broadcast or persisted — they add noise without UI value
        break;

      case 'start':
      case 'raw':
        break;

      case 'abort':
        throw new StreamAbortedError();
    }
  }

  flush(): void {
    const now = Date.now();
    if (this.currentTextPart && this.currentTextPart.text) {
      this.accumulatedParts.push({
        type: 'text-delta' as const,
        text: this.currentTextPart.text,
        id: this.currentTextPart.id,
        startedAt: this.currentTextPart.startedAt,
        endedAt: now,
      });
      this.currentTextPart = null;
    }
    if (this.currentReasoningPart && this.currentReasoningPart.text) {
      this.accumulatedParts.push({
        type: 'reasoning-delta' as const,
        text: this.currentReasoningPart.text,
        id: this.currentReasoningPart.id,
        startedAt: this.currentReasoningPart.startedAt,
        endedAt: now,
      });
      this.currentReasoningPart = null;
    }
  }
}
