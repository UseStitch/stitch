import { randomUUID } from 'node:crypto';
import { streamText, smoothStream } from 'ai';
import type { StoredPart } from '@openwork/shared';
import { getDb } from '../db/client.js';
import { messages } from '../db/schema.js';
import * as Log from './log.js';
import * as Sse from './sse.js';
import { createProvider } from '../provider/provider.js';
import type { ProviderCredentials } from '../provider/provider.js';

const log = Log.create({ service: 'stream-runner' });

export type LlmMessage = { role: 'user' | 'assistant'; content: string };

export async function runStream(opts: {
  sessionId: string;
  assistantMessageId: string;
  modelId: string;
  modelLabel: string;
  llmMessages: LlmMessage[];
  credentials: ProviderCredentials;
}): Promise<void> {
  const { sessionId, assistantMessageId, modelId, modelLabel, llmMessages, credentials } = opts;

  const provider = createProvider(credentials);
  const model = provider(modelId);

  // Accumulated locally for DB persistence only — not sent to FE
  const accumulatedParts: StoredPart[] = [];

  // Per-part start time, keyed by partId
  const partStartTimes = new Map<string, number>();

  let startedAt = 0;

  const result = streamText({
    model,
    messages: llmMessages,
     experimental_transform: smoothStream(),
    onError: ({ error }) => {
      log.error('stream error', { sessionId, messageId: assistantMessageId, error });
    },
  });

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-start': {
        partStartTimes.set(part.id, Date.now());
        await Sse.broadcast('stream-part-update', {
          sessionId,
          messageId: assistantMessageId,
          partId: part.id,
          part,
        });
        break;
      }

      case 'text-delta': {
        const now = Date.now();
        accumulatedParts.push({ ...part, startedAt: partStartTimes.get(part.id) ?? now, endedAt: now });
        await Sse.broadcast('stream-part-delta', {
          sessionId,
          messageId: assistantMessageId,
          partId: part.id,
          delta: part,
        });
        break;
      }

      case 'text-end': {
        await Sse.broadcast('stream-part-update', {
          sessionId,
          messageId: assistantMessageId,
          partId: part.id,
          part,
        });
        break;
      }

      case 'reasoning-start': {
        partStartTimes.set(part.id, Date.now());
        await Sse.broadcast('stream-part-update', {
          sessionId,
          messageId: assistantMessageId,
          partId: part.id,
          part,
        });
        break;
      }

      case 'reasoning-delta': {
        const now = Date.now();
        accumulatedParts.push({ ...part, startedAt: partStartTimes.get(part.id) ?? now, endedAt: now });
        await Sse.broadcast('stream-part-delta', {
          sessionId,
          messageId: assistantMessageId,
          partId: part.id,
          delta: part,
        });
        break;
      }

      case 'reasoning-end': {
        await Sse.broadcast('stream-part-update', {
          sessionId,
          messageId: assistantMessageId,
          partId: part.id,
          part,
        });
        break;
      }

      case 'tool-call': {
        const now = Date.now();
        accumulatedParts.push({ ...part, startedAt: now, endedAt: now });
        await Sse.broadcast('stream-part-update', {
          sessionId,
          messageId: assistantMessageId,
          partId: part.toolCallId,
          part,
        });
        break;
      }

      case 'tool-result': {
        const now = Date.now();
        accumulatedParts.push({ ...part, startedAt: now, endedAt: now });
        await Sse.broadcast('stream-part-update', {
          sessionId,
          messageId: assistantMessageId,
          partId: part.toolCallId,
          part,
        });
        break;
      }

      case 'source': {
        const now = Date.now();
        accumulatedParts.push({ ...part, startedAt: now, endedAt: now });
        await Sse.broadcast('stream-part-update', {
          sessionId,
          messageId: assistantMessageId,
          partId: part.id,
          part,
        });
        break;
      }

      case 'file': {
        const partId = randomUUID();
        const now = Date.now();
        accumulatedParts.push({ ...part, startedAt: now, endedAt: now });
        await Sse.broadcast('stream-part-update', {
          sessionId,
          messageId: assistantMessageId,
          partId,
          part,
        });
        break;
      }

      case 'finish': {
        const finishedAt = Date.now();
        const db = getDb();
        await db.insert(messages).values({
          id: assistantMessageId,
          sessionId,
          role: 'assistant',
          parts: accumulatedParts,
          model: modelLabel,
          usage: part.totalUsage,
          finishReason: part.finishReason,
          createdAt: new Date(startedAt),
          startedAt: new Date(startedAt),
          duration: startedAt > 0 ? finishedAt - startedAt : null,
        });

        await Sse.broadcast('stream-finish', {
          sessionId,
          messageId: assistantMessageId,
          finishReason: part.finishReason,
          usage: part.totalUsage,
        });
        break;
      }

      case 'error': {
        log.error('stream part error', { sessionId, messageId: assistantMessageId, error: part.error });
        await Sse.broadcast('stream-error', {
          sessionId,
          messageId: assistantMessageId,
          error: String(part.error),
        });
        break;
      }

      // Lifecycle events — not forwarded to FE
      case 'start': {
        startedAt = Date.now();
        await Sse.broadcast('stream-start', {
          sessionId,
          messageId: assistantMessageId,
        });
        break;
      }
      case 'start-step':
      case 'finish-step':
      case 'tool-input-start':
      case 'tool-input-delta':
      case 'tool-input-end':
      case 'tool-error':
      case 'raw':
        break;
    }
  }
}
