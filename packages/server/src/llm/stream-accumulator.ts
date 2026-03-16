import type { PartId, StoredPart } from '@openwork/shared';
import { createPartId } from '@openwork/shared';
import * as Sse from '@/lib/sse.js';
import * as Log from '@/lib/log.js';
import { stableStringify } from '@/utils/stable-stringify.js';
import type { ToolCallRecord } from '@/llm/doom-loop.js';

const log = Log.create({ service: 'stream-accumulator' });

export class StreamAccumulator {
  private currentTextPart: { id: PartId; text: string; startedAt: number } | null = null;
  private currentReasoningPart: { id: PartId; text: string; startedAt: number } | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly messageId: string,
    private readonly step: number,
    private readonly accumulatedParts: StoredPart[],
    private readonly toolCalls: ToolCallRecord[],
  ) {}

  async handlePart(part: any): Promise<void> {
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
        await Sse.broadcast('stream-tool-state', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          status: 'error',
          error: String(part.error),
        });

        log.warn('tool call failed', {
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          error: String(part.error),
        });
        break;
      }

      case 'error': {
        log.error('stream part error', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          error: part.error,
        });
        await Sse.broadcast('stream-error', {
          sessionId: this.sessionId,
          messageId: this.messageId,
          error: String(part.error),
        });
        break;
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
        throw new DOMException('Stream aborted', 'AbortError');
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
