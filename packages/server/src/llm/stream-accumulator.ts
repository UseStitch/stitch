import type { PartId, PrefixedString, StoredPart } from '@openwork/shared';
import { createPartId } from '@openwork/shared';

import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import {
  PermissionRejectedError,
  StreamAbortedError,
  StreamPartError,
  isPermissionRejectedMessage,
} from '@/lib/stream-errors.js';
import type { ToolCallRecord } from '@/llm/doom-loop.js';
import { stableStringify } from '@/utils/stable-stringify.js';

const log = Log.create({ service: 'stream-accumulator' });

export class StreamAccumulator {
  private currentTextPart: { id: PartId; text: string; startedAt: number } | null = null;
  private currentReasoningPart: { id: PartId; text: string; startedAt: number } | null = null;
  private protocolViolationCount = 0;

  constructor(
    private readonly sessionId: PrefixedString<'ses'>,
    private readonly messageId: PrefixedString<'msg'>,
    private readonly step: number,
    private readonly accumulatedParts: StoredPart[],
    private readonly toolCalls: ToolCallRecord[],
    private readonly streamRunId: string,
  ) {}

  getProtocolViolationCount(): number {
    return this.protocolViolationCount;
  }

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
      case 'text-start': {
        const partId = createPartId();
        this.currentTextPart = { id: partId, text: '', startedAt: Date.now() };
        await Sse.broadcast('stream-part-update', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          partId,
          part,
        });
        break;
      }

      case 'text-delta': {
        if (this.currentTextPart) {
          this.currentTextPart.text += part.text;
          await Sse.broadcast('stream-part-delta', {
            sessionId: this.sessionId,
            messageId: this.messageId,
            partId: this.currentTextPart.id,
            delta: part,
          });
        } else {
          this.protocolViolationCount++;
          log.warn(
            {
              event: 'stream.part.protocol_violation',
              streamRunId: this.streamRunId,
              sessionId: this.sessionId,
              messageId: this.messageId,
              step: this.step,
              violation: 'text_delta_without_text_start',
            },
            'stream.part.protocol_violation',
          );
        }
        break;
      }

      case 'text-end': {
        if (this.currentTextPart) {
          const now = Date.now();
          this.accumulatedParts.push({
            type: 'text-delta' as const,
            text: this.currentTextPart.text,
            id: this.currentTextPart.id,
            startedAt: this.currentTextPart.startedAt,
            endedAt: now,
          });
          await Sse.broadcast('stream-part-update', {
            sessionId: this.sessionId,
            messageId: this.messageId,
            partId: this.currentTextPart.id,
            part,
          });
          this.currentTextPart = null;
        }
        break;
      }

      case 'reasoning-start': {
        const partId = createPartId();
        this.currentReasoningPart = { id: partId, text: '', startedAt: Date.now() };
        await Sse.broadcast('stream-part-update', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          partId,
          part,
        });
        break;
      }

      case 'reasoning-delta': {
        if (this.currentReasoningPart) {
          this.currentReasoningPart.text += part.text;
          await Sse.broadcast('stream-part-delta', {
            sessionId: this.sessionId,
            messageId: this.messageId,
            partId: this.currentReasoningPart.id,
            delta: part,
          });
        } else {
          this.protocolViolationCount++;
          log.warn(
            {
              event: 'stream.part.protocol_violation',
              streamRunId: this.streamRunId,
              sessionId: this.sessionId,
              messageId: this.messageId,
              step: this.step,
              violation: 'reasoning_delta_without_reasoning_start',
            },
            'stream.part.protocol_violation',
          );
        }
        break;
      }

      case 'reasoning-end': {
        if (this.currentReasoningPart) {
          const now = Date.now();
          this.accumulatedParts.push({
            type: 'reasoning-delta' as const,
            text: this.currentReasoningPart.text,
            id: this.currentReasoningPart.id,
            startedAt: this.currentReasoningPart.startedAt,
            endedAt: now,
          });
          await Sse.broadcast('stream-part-update', {
            sessionId: this.sessionId,
            messageId: this.messageId,
            partId: this.currentReasoningPart.id,
            part,
          });
          this.currentReasoningPart = null;
        }
        break;
      }

      case 'source': {
        const now = Date.now();
        const partId = createPartId();
        this.accumulatedParts.push({ ...part, id: partId, startedAt: now, endedAt: now });
        await Sse.broadcast('stream-part-update', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          partId,
          part,
        });
        break;
      }

      case 'file': {
        const partId = createPartId();
        const now = Date.now();
        this.accumulatedParts.push({ ...part, id: partId, startedAt: now, endedAt: now });
        await Sse.broadcast('stream-part-update', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          partId,
          part,
        });
        break;
      }

      case 'tool-input-start': {
        await Sse.broadcast('stream-tool-state', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          toolCallId: part.id,
          toolName: part.toolName,
          status: 'pending',
        });
        break;
      }

      case 'tool-input-delta': {
        await Sse.broadcast('stream-tool-input-delta', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          toolCallId: part.id,
          toolName: '',
          inputTextDelta: part.delta,
        });
        break;
      }

      case 'tool-input-end':
        break;

      case 'tool-call': {
        const now = Date.now();
        const partId = createPartId();

        // Record for doom loop detection
        this.toolCalls.push({
          toolName: part.toolName,
          inputJson: stableStringify(part.input),
        });

        await Sse.broadcast('stream-tool-state', {
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

        await Sse.broadcast('stream-tool-state', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: 'completed',
          input: part.input,
          output: part.output,
        });

        this.accumulatedParts.push({
          type: 'tool-result',
          id: partId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          output: part.output,
          truncated: false,
          startedAt: now,
          endedAt: now,
        } as StoredPart);
        break;
      }

      case 'tool-error': {
        const now = Date.now();
        const partId = createPartId();
        const errorText = String(part.error);
        await Sse.broadcast('stream-tool-state', {
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

        if (isPermissionRejectedMessage(errorText)) {
          throw new PermissionRejectedError(part.toolName ?? 'unknown');
        }
        break;
      }

      case 'error': {
        const errorText = String(part.error);
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
            rawPartKeys: part && typeof part === 'object' ? Object.keys(part as Record<string, unknown>) : [],
          },
          'stream part error',
        );
        await Sse.broadcast('stream-error', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          error: errorText,
        });

        if (part.error instanceof Error) {
          throw new StreamPartError(part.error.message, { cause: part.error });
        }

        throw new StreamPartError(errorText);
      }

      case 'start-step': {
        const stepStartNow = Date.now();
        const partId = createPartId();
        this.accumulatedParts.push({
          type: 'step-start' as const,
          id: partId,
          step: this.step,
          startedAt: stepStartNow,
          endedAt: stepStartNow,
        });
        await Sse.broadcast('step-start', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          step: this.step,
        });
        break;
      }

      case 'finish-step': {
        const stepFinishNow = Date.now();
        const partId = createPartId();
        this.accumulatedParts.push({
          type: 'step-finish' as const,
          id: partId,
          step: this.step,
          finishReason: part.finishReason,
          usage: part.usage,
          startedAt: stepFinishNow,
          endedAt: stepFinishNow,
        });
        await Sse.broadcast('step-finish', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          step: this.step,
          finishReason: part.finishReason,
          usage: part.usage,
        });
        break;
      }

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
